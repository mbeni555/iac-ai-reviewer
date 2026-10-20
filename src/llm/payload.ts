import { oneLine } from "../text";
import type { SanitizedFinding } from "../types";

export const LLM_FIELD_ALLOWLIST = [
  "id",
  "scanner",
  "checkId",
  "title",
  "description",
  "file",
  "startLine",
  "endLine",
  "resource",
  "scannerSeverity",
  "snippet",
] as const;

export type LlmPayload = Record<(typeof LLM_FIELD_ALLOWLIST)[number], string | number>;

export function toLlmPayload(finding: SanitizedFinding): LlmPayload {
  return {
    id: finding.id,
    scanner: finding.scanner,
    checkId: finding.checkId,
    title: oneLine(finding.title, 200),
    description: oneLine(finding.description ?? "", 280),
    file: finding.file,
    startLine: finding.startLine,
    endLine: finding.endLine,
    resource: finding.resource ?? "",
    scannerSeverity: finding.scannerSeverity ?? "",
    snippet: finding.snippet,
  };
}
