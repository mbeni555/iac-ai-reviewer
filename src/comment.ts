import { fenceLanguage } from "./paths";
import { oneLine } from "./text";
import {
  SEVERITIES,
  scannerLabel,
  severityLabel,
  type RenderedFinding,
  type ScannerName,
  type Severity,
} from "./types";

export const COMMENT_MARKER = "<!-- iac-ai-reviewer -->";
export const COMMENT_LIMIT = 60000;

export interface MarkerComment {
  id: number;
  body?: string;
}

export interface CommentModel {
  findings: readonly RenderedFinding[];
  filesScanned: readonly string[];
  scanners: readonly ScannerName[];
  omittedCount: number;
  mode: "llm" | "llm-failed" | "no-key" | "not-sent";
  model?: string;
  providerHost?: string;
  llmError?: string;
  partialCount: number;
}

export function partitionMarkerComments<T extends MarkerComment>(
  comments: readonly T[],
  marker: string = COMMENT_MARKER,
): { keep: T | null; extras: T[] } {
  const matches = comments
    .filter((comment) => (comment.body ?? "").includes(marker))
    .sort((left, right) => left.id - right.id);
  return {
    keep: matches[0] ?? null,
    extras: matches.slice(1),
  };
}

export function countSeverities(findings: readonly { risk: Severity }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.risk] += 1;
  return counts;
}

export function renderComment(model: CommentModel): string {
  const lines: string[] = [COMMENT_MARKER, "## IaC AI Reviewer", ""];
  const scanners = model.scanners.map(scannerLabel).join(" and ") || "none";
  const fileCount = model.filesScanned.length;
  const fileWord = fileCount === 1 ? "file" : "files";

  if (model.findings.length === 0) {
    lines.push(`No misconfigurations in ${fileCount} Terraform or Kubernetes ${fileWord}.`);
    lines.push("");
    lines.push(`Scanners: ${scanners}.`);
    lines.push("");
    lines.push(renderFooter(model));
    lines.push("");
    lines.push(renderFileList(model.filesScanned));
    return limitComment(lines.join("\n").trim() + "\n");
  }

  const counts = countSeverities(model.findings);
  lines.push(`**${model.findings.length} findings** in ${fileCount} ${fileWord} · ${scanners}`);
  lines.push("");
  lines.push("| Severity | Findings |");
  lines.push("| --- | ---: |");
  for (const severity of SEVERITIES) {
    lines.push(`| ${severityLabel(severity)} | ${counts[severity]} |`);
  }
  lines.push("");
  if (model.omittedCount > 0) {
    const omitted =
      model.omittedCount === 1
        ? "1 additional finding was left out"
        : `${model.omittedCount} additional findings were left out`;
    lines.push(`_${omitted} because of \`max_findings\`. The ones below are the highest baseline risk._`);
    lines.push("");
  }
  lines.push(renderMode(model));
  lines.push("");

  const detailed = model.findings.filter((finding) => finding.detailed);
  const compact = model.findings.filter((finding) => !finding.detailed);
  for (const finding of detailed) {
    lines.push(renderFinding(finding));
    lines.push("");
  }
  if (compact.length > 0) {
    lines.push("### Also flagged");
    lines.push("");
    lines.push("| Severity | Check | Location | Finding |");
    lines.push("| --- | --- | --- | --- |");
    for (const finding of compact) {
      lines.push(
        `| ${severityLabel(finding.risk)} | \`${finding.checkId}\` | \`${finding.file}:${finding.startLine}\` | ${tableCell(finding.title)} |`,
      );
    }
    lines.push("");
  }
  lines.push(renderFooter(model));
  lines.push("");
  lines.push(renderFileList(model.filesScanned));
  return limitComment(lines.join("\n").trim() + "\n");
}

export function limitComment(body: string, max = COMMENT_LIMIT): string {
  if (body.length <= max) return body;
  const notice = "\n\n_Comment truncated to fit GitHub's length limit._\n";
  if (notice.length >= max) return notice.slice(0, max);
  return `${body.slice(0, max - notice.length).trimEnd()}${notice}`;
}

function renderFinding(finding: RenderedFinding): string {
  const where = `\`${finding.file}:${finding.startLine}\``;
  const resource = finding.resource ? ` · \`${finding.resource}\`` : "";
  const lines = [
    `### ${severityLabel(finding.risk)} — ${finding.checkId} — ${heading(finding.title)}`,
    "",
    `${scannerLabel(finding.scanner)} · ${where}${resource}`,
    "",
    `**Why it matters.** ${oneLine(finding.reason, 220)}`,
    "",
  ];
  const summary = oneLine(finding.summary, 500);
  if (summary.toLowerCase() !== oneLine(finding.title, 500).toLowerCase()) {
    lines.push(finding.summary.trim(), "");
  }
  lines.push("**What to change.**", "", renderFix(finding.fix, finding.file), "");
  lines.push(renderSnippet(finding));
  return lines.join("\n");
}

function renderFix(fix: string, file: string): string {
  const trimmed = fix.trim();
  if (!trimmed.includes("\n")) return trimmed;
  const lang = fenceLanguage(file);
  return `\`\`\`${lang}\n${trimmed}\n\`\`\``;
}

function renderSnippet(finding: RenderedFinding): string {
  if (finding.snippet.startsWith("(snippet omitted")) {
    return `_${finding.snippet}_`;
  }
  const lang = fenceLanguage(finding.file);
  return [
    "<details>",
    "<summary>Redacted snippet</summary>",
    "",
    `\`\`\`${lang}`,
    finding.snippet,
    "```",
    "",
    "</details>",
  ].join("\n");
}

function renderMode(model: CommentModel): string {
  if (model.mode === "llm") {
    const partial =
      model.partialCount > 0
        ? ` ${model.partialCount} ${model.partialCount === 1 ? "finding kept the scanner text because the model omitted it" : "findings kept the scanner text because the model omitted them"}.`
        : "";
    return `Plain-English notes below are from \`${model.model ?? "the model"}\`.${partial}`;
  }
  if (model.mode === "llm-failed") {
    return `The LLM call failed (${model.llmError ?? "unknown error"}). Showing scanner findings instead.`;
  }
  if (model.mode === "not-sent") {
    return "An API key is set, but nothing was sent to the model for this run.";
  }
  return "No LLM API key was set. Risk comes from scanner severity when the scanner provides it, otherwise from a built-in map of well-known checks. The guidance below is the scanner's own text.";
}

function renderFooter(model: CommentModel): string {
  const privacy =
    model.mode === "llm"
      ? `Only a redacted snippet and the finding metadata were sent to ${model.providerHost ?? "the model endpoint"}.`
      : "Nothing was sent to an LLM on this run.";
  return ["---", "", privacy, "", "Re-runs update this comment instead of posting a new one."].join("\n");
}

function renderFileList(files: readonly string[]): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, 50);
  const extra = files.length - shown.length;
  const items = shown.map((file) => `- \`${file}\``);
  if (extra > 0) items.push(`- _and ${extra} more_`);
  return ["<details>", "<summary>Files scanned</summary>", "", ...items, "", "</details>"].join("\n");
}

function heading(title: string): string {
  return oneLine(title, 140).replace(/#/g, "");
}

function tableCell(text: string): string {
  return oneLine(text, 90).replace(/\|/g, "\\|");
}
