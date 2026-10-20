import { partitionMarkerComments } from "./comment";
import { providerHost, type Config } from "./config";
import type { LlmProvider } from "./llm/provider";
import { createOpenAiProvider } from "./llm/openai";
import { highestSeverity, shouldFail } from "./rank";
import { buildReview, type FileSlice } from "./review";
import type { RawFinding, ScannerName, Severity } from "./types";

export interface ScannerRun {
  name: ScannerName;
  scan(files: readonly string[], cwd: string): Promise<RawFinding[]>;
}

export interface CommentRecord {
  id: number;
  body?: string;
}

export interface CommentClient {
  list(): Promise<CommentRecord[]>;
  create(body: string): Promise<string>;
  update(id: number, body: string): Promise<string>;
  delete(id: number): Promise<void>;
}

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  setOutput(name: string, value: string): void;
  setSecret(value: string): void;
  writeSummary(markdown: string): Promise<void>;
}

export interface ExecuteContext {
  config: Config;
  workspace: string;
  pullRequestNumber: number | null;
  discoverFiles: () => Promise<string[]>;
  scanners: readonly ScannerRun[];
  comments: CommentClient | null;
  readFile: (file: string) => Promise<FileSlice>;
  log: Logger;
  llm?: LlmProvider | null;
}

export interface ExecuteResult {
  findingsCount: number;
  omittedCount: number;
  filesScanned: number;
  highest: Severity | "none";
  usedLlm: boolean;
  commentUrl?: string;
  commentBody: string;
  failed: boolean;
  failureMessage?: string;
}

export async function execute(ctx: ExecuteContext): Promise<ExecuteResult> {
  if (ctx.config.apiKey) ctx.log.setSecret(ctx.config.apiKey);
  const files = await ctx.discoverFiles();
  ctx.log.info(`IaC AI Reviewer is scanning ${files.length} file(s).`);
  for (const file of files) ctx.log.info(`  ${file}`);

  const raw: RawFinding[] = [];
  if (files.length > 0) {
    for (const scanner of ctx.scanners) {
      const found = await scanner.scan(files, ctx.workspace);
      ctx.log.info(`${scanner.name} reported ${found.length} finding(s).`);
      raw.push(...found);
    }
  }

  const llm = resolveLlm(ctx);
  const built = await buildReview({
    raw,
    filesScanned: files,
    scanners: ctx.scanners.map((scanner) => scanner.name),
    workspace: ctx.workspace,
    llm,
    llmConfigured: Boolean(ctx.config.apiKey),
    model: ctx.config.model,
    providerHost: providerHost(ctx.config.baseUrl),
    maxFindings: ctx.config.maxFindings,
    maxExplained: ctx.config.maxExplained,
    maxSnippetLines: ctx.config.maxSnippetLines,
    maxSnippetChars: ctx.config.maxSnippetChars,
    readFile: ctx.readFile,
  });

  if (built.llmError) ctx.log.warning(`LLM explanations were skipped: ${built.llmError}`);

  const commentUrl = await publishComment(ctx, built.comment);
  const highest = highestSeverity(built.findings.map((finding) => finding.risk));
  const failed = shouldFail(highest, ctx.config.failOn);
  const result: ExecuteResult = {
    findingsCount: built.findings.length,
    omittedCount: built.omittedCount,
    filesScanned: files.length,
    highest: highest ?? "none",
    usedLlm: built.usedLlm,
    commentUrl,
    commentBody: built.comment,
    failed,
    failureMessage: failed
      ? `Found ${highest} risk, which meets fail_on=${ctx.config.failOn}.`
      : undefined,
  };
  writeOutputs(ctx.log, result);
  await ctx.log.writeSummary(result.commentBody);
  return result;
}

export function resolveLlm(ctx: ExecuteContext): LlmProvider | null {
  if (ctx.llm !== undefined) return ctx.llm;
  if (!ctx.config.apiKey) return null;
  return createOpenAiProvider({
    apiKey: ctx.config.apiKey,
    baseUrl: ctx.config.baseUrl,
    model: ctx.config.model,
    maxTokens: ctx.config.maxTokens,
    batchSize: ctx.config.batchSize,
    jsonMode: ctx.config.jsonMode,
  });
}

async function publishComment(ctx: ExecuteContext, body: string): Promise<string | undefined> {
  if (!ctx.config.comment) {
    ctx.log.info("comment=false, so no pull request comment will be posted.");
    return undefined;
  }
  if (!ctx.pullRequestNumber || !ctx.comments) {
    ctx.log.info("This run is not a pull request, so the review was written to the job summary only.");
    return undefined;
  }
  const existing = await ctx.comments.list();
  const { keep, extras } = partitionMarkerComments(existing);
  const url = keep ? await ctx.comments.update(keep.id, body) : await ctx.comments.create(body);
  for (const extra of extras) {
    try {
      await ctx.comments.delete(extra.id);
      ctx.log.info(`Removed duplicate IaC AI Reviewer comment ${extra.id}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log.warning(`Could not remove duplicate comment ${extra.id}: ${message}`);
    }
  }
  return url;
}

function writeOutputs(log: Logger, result: ExecuteResult): void {
  log.setOutput("findings_count", String(result.findingsCount));
  log.setOutput("omitted_count", String(result.omittedCount));
  log.setOutput("files_scanned", String(result.filesScanned));
  log.setOutput("highest_severity", result.highest);
  log.setOutput("used_llm", result.usedLlm ? "true" : "false");
  log.setOutput("comment_url", result.commentUrl ?? "");
}
