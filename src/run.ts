import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFile, stat } from "fs/promises";
import { join } from "path";

import { parseConfig, type RawConfig } from "./config";
import { collectFiles } from "./discover";
import { execute, type CommentClient } from "./execute";
import { createOpenAiProvider } from "./llm/openai";
import {
  isInsideRepo,
  isScannableStatus,
  isTerraformFile,
  isYamlFile,
  looksLikeKubernetes,
  matchesPathPrefix,
  normalizePath,
} from "./paths";
import { MAX_FILE_BYTES, type FileSlice } from "./review";
import { runCheckov, runTrivy } from "./scanners/run";

export async function run(): Promise<void> {
  try {
    const config = parseConfig(readInputs());
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const pullRequestNumber = pullRequestFromContext();
    const { owner, repo } = github.context.repo;
    const comments =
      config.comment && pullRequestNumber && config.githubToken && owner && repo
        ? githubComments(config.githubToken, owner, repo, pullRequestNumber)
        : null;
    if (config.comment && pullRequestNumber && !config.githubToken) {
      throw new Error("github_token is required to post the pull request comment.");
    }

    const result = await execute({
      config,
      workspace,
      pullRequestNumber,
      comments,
      scanners: config.scanners.map((name) => ({
        name,
        scan: (files, cwd) => (name === "checkov" ? runCheckov(files, cwd) : runTrivy(files, cwd)),
      })),
      llm: config.apiKey
        ? createOpenAiProvider({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            maxTokens: config.maxTokens,
            batchSize: config.batchSize,
            jsonMode: config.jsonMode,
          })
        : null,
      readFile: (file) => readWorkspaceFile(workspace, file),
      log: actionLogger(),
      discoverFiles: () =>
        discover({
          workspace,
          scanMode: config.scanMode,
          paths: config.paths,
          maxFiles: config.maxFiles,
          pullRequestNumber,
          token: config.githubToken,
          owner,
          repo,
        }),
    });
    if (result.failed && result.failureMessage) core.setFailed(result.failureMessage);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function readInputs(): RawConfig {
  return {
    scanners: core.getInput("scanners"),
    scanMode: core.getInput("scan_mode"),
    paths: core.getInput("paths"),
    openaiApiKey: core.getInput("openai_api_key"),
    openaiBaseUrl: core.getInput("openai_base_url"),
    openaiModel: core.getInput("openai_model"),
    jsonMode: core.getInput("openai_json_mode"),
    maxFindings: core.getInput("max_findings"),
    maxExplained: core.getInput("max_explained"),
    maxSnippetLines: core.getInput("max_snippet_lines"),
    maxSnippetChars: core.getInput("max_snippet_chars"),
    llmBatchSize: core.getInput("llm_batch_size"),
    llmMaxTokens: core.getInput("llm_max_tokens"),
    maxFiles: core.getInput("max_files"),
    failOn: core.getInput("fail_on"),
    githubToken: core.getInput("github_token"),
    comment: core.getInput("comment"),
  };
}

function pullRequestFromContext(): number | null {
  const pullRequest = github.context.payload.pull_request;
  return pullRequest && typeof pullRequest.number === "number" ? pullRequest.number : null;
}

async function discover(input: {
  workspace: string;
  scanMode: "changed" | "all";
  paths: string[];
  maxFiles: number;
  pullRequestNumber: number | null;
  token: string;
  owner: string;
  repo: string;
}): Promise<string[]> {
  if (input.scanMode === "changed" && input.pullRequestNumber) {
    if (!input.token) {
      throw new Error("github_token is required to list files changed in the pull request.");
    }
    if (!input.owner || !input.repo) {
      throw new Error("GITHUB_REPOSITORY is required to list files changed in the pull request.");
    }
    const octokit = github.getOctokit(input.token);
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullRequestNumber,
      per_page: 100,
    });
    const selected: string[] = [];
    for (const file of files) {
      if (!isScannableStatus(file.status)) continue;
      if (!matchesPathPrefix(file.filename, input.paths)) continue;
      const rel = normalizePath(file.filename);
      if (isTerraformFile(rel)) {
        selected.push(rel);
        continue;
      }
      if (!isYamlFile(rel) || !isInsideRepo(input.workspace, rel)) continue;
      const content = await readFile(join(input.workspace, rel), "utf8");
      if (looksLikeKubernetes(content)) selected.push(rel);
    }
    return capFiles(selected, input.maxFiles);
  }

  if (input.scanMode === "changed") {
    core.warning(
      "scan_mode is changed, but this run is not a pull request. Scanning all in-scope files instead.",
    );
  }
  const collected = await collectFiles(input.workspace, input.paths, input.maxFiles);
  for (const missing of collected.missingPrefixes) {
    core.warning(`Path not found, so it was skipped: ${missing}`);
  }
  if (collected.truncated) {
    core.warning(`Scanning the first ${input.maxFiles} files. Raise max_files to include more.`);
  }
  return collected.files;
}

function capFiles(files: string[], maxFiles: number): string[] {
  const unique = [...new Set(files)].sort();
  if (unique.length > maxFiles) {
    core.warning(`Scanning the first ${maxFiles} changed files. Raise max_files to include more.`);
    return unique.slice(0, maxFiles);
  }
  return unique;
}

async function readWorkspaceFile(workspace: string, file: string): Promise<FileSlice> {
  if (!isInsideRepo(workspace, file)) return { bytes: 0 };
  try {
    const info = await stat(join(workspace, file));
    if (info.size > MAX_FILE_BYTES) return { bytes: info.size };
    return { bytes: info.size, text: await readFile(join(workspace, file), "utf8") };
  } catch {
    return { bytes: 0 };
  }
}

function githubComments(token: string, owner: string, repo: string, pullNumber: number): CommentClient {
  const octokit = github.getOctokit(token);
  return {
    async list() {
      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: pullNumber,
        per_page: 100,
      });
      return comments.map((comment) => ({ id: comment.id, body: comment.body ?? "" }));
    },
    async create(body: string) {
      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });
      return response.data.html_url;
    },
    async update(id: number, body: string) {
      const response = await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: id,
        body,
      });
      return response.data.html_url;
    },
    async delete(id: number) {
      await octokit.rest.issues.deleteComment({ owner, repo, comment_id: id });
    },
  };
}

function actionLogger() {
  return {
    info: (message: string) => core.info(message),
    warning: (message: string) => core.warning(message),
    setOutput: (name: string, value: string) => core.setOutput(name, value),
    setSecret: (value: string) => core.setSecret(value),
    writeSummary: async (markdown: string) => {
      if (!process.env.GITHUB_STEP_SUMMARY) return;
      await core.summary.addRaw(markdown).write();
    },
  };
}

