import { isInsideRepo, normalizePath } from "./paths";
import { baselineRisk, compareRiskThenLocation } from "./rank";
import { redact } from "./redact";
import { extractSnippet } from "./snippet";
import { safeError, truncate } from "./text";
import type { LlmProvider } from "./llm/provider";
import { renderComment, type CommentModel } from "./comment";
import type { Explanation, RawFinding, RenderedFinding, SanitizedFinding, ScannerName } from "./types";

export const MAX_FILE_BYTES = 512 * 1024;

export interface FileSlice {
  bytes: number;
  text?: string;
}

export interface BuildReviewInput {
  raw: readonly RawFinding[];
  filesScanned: readonly string[];
  scanners: readonly ScannerName[];
  workspace: string;
  llm: LlmProvider | null;
  llmConfigured: boolean;
  model?: string;
  providerHost?: string;
  maxFindings: number;
  maxExplained: number;
  maxSnippetLines: number;
  maxSnippetChars: number;
  readFile: (file: string) => Promise<FileSlice>;
}

export interface BuiltReview {
  findings: RenderedFinding[];
  sanitizedForLlm: SanitizedFinding[];
  comment: string;
  usedLlm: boolean;
  llmError?: string;
  omittedCount: number;
  mode: CommentModel["mode"];
}

export async function buildReview(input: BuildReviewInput): Promise<BuiltReview> {
  const sanitized: SanitizedFinding[] = [];
  for (const raw of assignIds(dedupeFindings(input.raw))) {
    sanitized.push(await sanitize(raw, input));
  }
  sanitized.sort((left, right) =>
    compareRiskThenLocation(
      { risk: left.baselineRisk, file: left.file, startLine: left.startLine },
      { risk: right.baselineRisk, file: right.file, startLine: right.startLine },
    ),
  );

  const kept = sanitized.slice(0, input.maxFindings);
  const omittedCount = sanitized.length - kept.length;
  const explainCount = Math.min(input.maxExplained, kept.length);
  const toExplain = kept.slice(0, explainCount);
  const rest = kept.slice(explainCount);

  let explanations = new Map<string, Explanation>();
  let usedLlm = false;
  let llmError: string | undefined;
  if (input.llm && toExplain.length > 0) {
    try {
      const got = await input.llm.explain(toExplain);
      explanations = indexExplanations(got, new Set(toExplain.map((finding) => finding.id)));
      if (explanations.size === 0) {
        throw new Error("The model response did not match any finding ids.");
      }
      usedLlm = true;
    } catch (error) {
      llmError = safeError(error);
      explanations = new Map();
      usedLlm = false;
    }
  }

  const findings = [
    ...toExplain.map((finding) => toRendered(finding, explanations.get(finding.id), true)),
    ...rest.map((finding) => toRendered(finding, undefined, false)),
  ].sort((left, right) => compareRiskThenLocation(left, right));

  const partialCount = usedLlm ? toExplain.filter((finding) => !explanations.has(finding.id)).length : 0;
  const mode = commentMode(input, usedLlm, llmError, toExplain.length);
  const comment = renderComment({
    findings,
    filesScanned: input.filesScanned,
    scanners: input.scanners,
    omittedCount,
    mode,
    model: input.model,
    providerHost: input.providerHost,
    llmError,
    partialCount,
  });

  return {
    findings,
    sanitizedForLlm: toExplain,
    comment,
    usedLlm,
    llmError,
    omittedCount,
    mode,
  };
}

export function dedupeFindings(findings: readonly RawFinding[]): RawFinding[] {
  const seen = new Set<string>();
  const unique: RawFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.scanner,
      finding.checkId,
      normalizePath(finding.file),
      String(finding.startLine ?? 0),
      String(finding.endLine ?? 0),
      finding.title,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

function assignIds(findings: readonly RawFinding[]): Array<RawFinding & { id: string }> {
  const counts = new Map<string, number>();
  return findings.map((finding) => {
    const base = [
      finding.scanner,
      finding.checkId,
      normalizePath(finding.file),
      String(finding.startLine ?? 0),
      String(finding.endLine ?? 0),
    ].join(":");
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    return { ...finding, id: seen === 1 ? base : `${base}:${seen}` };
  });
}

async function sanitize(raw: RawFinding & { id: string }, input: BuildReviewInput): Promise<SanitizedFinding> {
  const file = normalizePath(raw.file);
  const ranked = baselineRisk({ checkId: raw.checkId, severity: raw.severity, title: raw.title });
  const startLine = raw.startLine && raw.startLine > 0 ? Math.floor(raw.startLine) : 1;
  const endLine = raw.endLine && raw.endLine >= startLine ? Math.floor(raw.endLine) : startLine;
  return {
    id: raw.id,
    scanner: raw.scanner,
    checkId: raw.checkId,
    title: raw.title,
    description: raw.description,
    resolution: raw.resolution,
    guidelineUrl: raw.guidelineUrl,
    scannerSeverity: raw.severity,
    file,
    startLine,
    endLine,
    resource: raw.resource,
    snippet: await snippetFor(file, startLine, endLine, input),
    baselineRisk: ranked.risk,
    baselineReason: ranked.reason,
  };
}

async function snippetFor(
  file: string,
  startLine: number,
  endLine: number,
  input: BuildReviewInput,
): Promise<string> {
  if (!isInsideRepo(input.workspace, file)) {
    return "(snippet omitted: path is outside the workspace)";
  }
  const slice = await input.readFile(file);
  if (slice.text === undefined) {
    if (slice.bytes > MAX_FILE_BYTES) return "(snippet omitted: file is larger than 512 KB)";
    return "(snippet omitted: file could not be read)";
  }
  const window = extractSnippet(slice.text, startLine, endLine, input.maxSnippetLines);
  return truncate(redact(window.snippet), input.maxSnippetChars);
}

function toRendered(
  finding: SanitizedFinding,
  explanation: Explanation | undefined,
  detailed: boolean,
): RenderedFinding {
  const scanner = scannerNarrative(finding);
  const fromLlm = Boolean(explanation);
  return {
    id: finding.id,
    scanner: finding.scanner,
    checkId: finding.checkId,
    title: finding.title,
    file: finding.file,
    startLine: finding.startLine,
    endLine: finding.endLine,
    resource: finding.resource,
    risk: explanation?.risk ?? finding.baselineRisk,
    reason: explanation?.reason ?? finding.baselineReason,
    summary: explanation?.summary ?? scanner.summary,
    fix: explanation?.fix ?? scanner.fix,
    snippet: finding.snippet,
    detailed,
    fromLlm,
  };
}

function scannerNarrative(finding: SanitizedFinding): { summary: string; fix: string } {
  const summary = finding.description?.trim() || finding.title;
  let fix = "The scanner did not include a remediation. Change the flagged attribute so the check passes.";
  if (finding.resolution?.trim()) fix = finding.resolution.trim();
  else if (finding.guidelineUrl) fix = `Follow the scanner guideline: ${finding.guidelineUrl}`;
  return {
    summary: redact(truncate(summary, 700)),
    fix: redact(truncate(fix, 700)),
  };
}

function indexExplanations(list: readonly Explanation[], allowed: ReadonlySet<string>): Map<string, Explanation> {
  const map = new Map<string, Explanation>();
  for (const item of list) {
    if (!allowed.has(item.id)) continue;
    map.set(item.id, item);
  }
  return map;
}

function commentMode(
  input: BuildReviewInput,
  usedLlm: boolean,
  llmError: string | undefined,
  explainCount: number,
): CommentModel["mode"] {
  if (llmError) return "llm-failed";
  if (usedLlm) return "llm";
  if (input.llmConfigured && explainCount === 0) return "not-sent";
  return "no-key";
}
