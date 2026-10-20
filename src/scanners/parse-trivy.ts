import { asNumber, asString, isRecord } from "../json";
import { normalizePath, toRepoRelative } from "../paths";
import type { RawFinding } from "../types";

export function parseTrivyOutput(
  json: unknown,
  scanDir: string,
  repoRoot: string,
  allow: ReadonlySet<string> | undefined,
): RawFinding[] {
  if (!isRecord(json) || !Array.isArray(json.Results)) return [];
  const findings: RawFinding[] = [];
  for (const result of json.Results) {
    if (!isRecord(result)) continue;
    const target = asString(result.Target) ?? "";
    const misconfigurations = result.Misconfigurations;
    if (!Array.isArray(misconfigurations)) continue;
    const file = resolveTrivyTarget(scanDir, target, repoRoot);
    if (allow && !allow.has(file)) continue;
    for (const item of misconfigurations) {
      const finding = parseMisconfig(item, file);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

export function resolveTrivyTarget(scanDir: string, target: string, repoRoot: string): string {
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
    return toRepoRelative(target, repoRoot);
  }
  const normalizedTarget = normalizePath(target);
  const normalizedDir = normalizePath(scanDir);
  if (normalizedTarget === "" || normalizedTarget === ".") {
    return normalizedDir === "" ? "." : normalizedDir;
  }
  if (normalizedDir === "" || normalizedDir === ".") return normalizedTarget;
  return normalizePath(`${normalizedDir}/${normalizedTarget}`);
}

function parseMisconfig(value: unknown, file: string): RawFinding | null {
  if (!isRecord(value)) return null;
  const status = (asString(value.Status) ?? "").toUpperCase();
  if (status === "PASS" || status === "SUCCESS") return null;
  const checkId = asString(value.ID);
  const title = asString(value.Title);
  if (!checkId || !title) return null;
  const cause = isRecord(value.CauseMetadata) ? value.CauseMetadata : undefined;
  const message = asString(value.Message);
  const description = asString(value.Description);
  const combined = [message, description].filter((part): part is string => Boolean(part)).join("\n\n");
  return {
    scanner: "trivy",
    checkId,
    title,
    description: combined || undefined,
    resolution: asString(value.Resolution),
    guidelineUrl: asString(value.PrimaryURL),
    severity: asString(value.Severity),
    file,
    startLine: cause ? asNumber(cause.StartLine) : undefined,
    endLine: cause ? asNumber(cause.EndLine) : undefined,
    resource: cause ? asString(cause.Resource) : undefined,
  };
}
