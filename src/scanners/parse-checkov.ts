import { asNumber, asString, isRecord } from "../json";
import { toRepoRelative } from "../paths";
import type { RawFinding } from "../types";

export function parseCheckovOutput(json: unknown, repoRoot: string): RawFinding[] {
  const documents = Array.isArray(json) ? json : [json];
  const findings: RawFinding[] = [];
  for (const document of documents) {
    if (!isRecord(document)) continue;
    const results = isRecord(document.results) ? document.results : undefined;
    const failed = results?.failed_checks;
    if (!Array.isArray(failed)) continue;
    for (const check of failed) {
      const finding = parseCheck(check, repoRoot);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

function parseCheck(value: unknown, repoRoot: string): RawFinding | null {
  if (!isRecord(value)) return null;
  const checkId = asString(value.check_id);
  const title = asString(value.check_name);
  if (!checkId || !title) return null;
  const file = checkovFile(value, repoRoot);
  const range = lineRange(value.file_line_range);
  return {
    scanner: "checkov",
    checkId,
    title,
    description: asString(value.description),
    guidelineUrl: asString(value.guideline),
    severity: asString(value.severity),
    file,
    startLine: range.start,
    endLine: range.end,
    resource: asString(value.resource),
  };
}

function checkovFile(check: Record<string, unknown>, repoRoot: string): string {
  const absolute = asString(check.file_abs_path);
  if (absolute) return toRepoRelative(absolute, repoRoot);
  const repoPath = asString(check.repo_file_path);
  if (repoPath) return toRepoRelative(repoPath, repoRoot);
  return toRepoRelative(asString(check.file_path) ?? "unknown", repoRoot);
}

function lineRange(value: unknown): { start?: number; end?: number } {
  if (!Array.isArray(value)) return {};
  return {
    start: asNumber(value[0]),
    end: asNumber(value[1]),
  };
}
