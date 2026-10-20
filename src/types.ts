export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export type Severity = (typeof SEVERITIES)[number];

export type ScannerName = "checkov" | "trivy";

export type FailOn = "none" | Severity;

export interface RawFinding {
  scanner: ScannerName;
  checkId: string;
  title: string;
  description?: string;
  resolution?: string;
  guidelineUrl?: string;
  severity?: string;
  file: string;
  startLine?: number;
  endLine?: number;
  resource?: string;
}

export interface SanitizedFinding {
  id: string;
  scanner: ScannerName;
  checkId: string;
  title: string;
  description?: string;
  resolution?: string;
  guidelineUrl?: string;
  scannerSeverity?: string;
  file: string;
  startLine: number;
  endLine: number;
  resource?: string;
  snippet: string;
  baselineRisk: Severity;
  baselineReason: string;
}

export interface Explanation {
  id: string;
  risk: Severity;
  reason: string;
  summary: string;
  fix: string;
}

export interface RenderedFinding {
  id: string;
  scanner: ScannerName;
  checkId: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  resource?: string;
  risk: Severity;
  reason: string;
  summary: string;
  fix: string;
  snippet: string;
  detailed: boolean;
  fromLlm: boolean;
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
  }
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

export function scannerLabel(scanner: ScannerName): string {
  return scanner === "checkov" ? "Checkov" : "Trivy";
}

export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}
