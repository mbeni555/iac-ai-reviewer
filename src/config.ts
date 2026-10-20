import type { FailOn, ScannerName, Severity } from "./types";
import { isSeverity } from "./types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface RawConfig {
  scanners?: string;
  scanMode?: string;
  paths?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  jsonMode?: string;
  maxFindings?: string;
  maxExplained?: string;
  maxSnippetLines?: string;
  maxSnippetChars?: string;
  llmBatchSize?: string;
  llmMaxTokens?: string;
  maxFiles?: string;
  failOn?: string;
  githubToken?: string;
  comment?: string;
}

export interface Config {
  scanners: ScannerName[];
  scanMode: "changed" | "all";
  paths: string[];
  apiKey: string;
  baseUrl: string;
  model: string;
  jsonMode: boolean;
  maxFindings: number;
  maxExplained: number;
  maxSnippetLines: number;
  maxSnippetChars: number;
  batchSize: number;
  maxTokens: number;
  maxFiles: number;
  failOn: FailOn;
  githubToken: string;
  comment: boolean;
}

export function parseConfig(raw: RawConfig): Config {
  const scanners = parseScanners(raw.scanners);
  const scanMode = parseScanMode(raw.scanMode);
  const maxFindings = parseIntInRange(raw.maxFindings, 30, 1, 100, "max_findings");
  let maxExplained = parseIntInRange(raw.maxExplained, 8, 0, 30, "max_explained");
  if (maxExplained > maxFindings) maxExplained = maxFindings;
  return {
    scanners,
    scanMode,
    paths: parsePaths(raw.paths),
    apiKey: (raw.openaiApiKey ?? "").trim(),
    baseUrl: parseBaseUrl(raw.openaiBaseUrl),
    model: parseModel(raw.openaiModel),
    jsonMode: parseBoolean(raw.jsonMode, true, "openai_json_mode"),
    maxFindings,
    maxExplained,
    maxSnippetLines: parseIntInRange(raw.maxSnippetLines, 30, 5, 80, "max_snippet_lines"),
    maxSnippetChars: parseIntInRange(raw.maxSnippetChars, 800, 200, 4000, "max_snippet_chars"),
    batchSize: parseIntInRange(raw.llmBatchSize, 5, 1, 10, "llm_batch_size"),
    maxTokens: parseIntInRange(raw.llmMaxTokens, 1200, 256, 4096, "llm_max_tokens"),
    maxFiles: parseIntInRange(raw.maxFiles, 100, 1, 500, "max_files"),
    failOn: parseFailOn(raw.failOn),
    githubToken: (raw.githubToken ?? "").trim(),
    comment: parseBoolean(raw.comment, true, "comment"),
  };
}

export function providerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the model endpoint";
  }
}

function parseScanners(value: string | undefined): ScannerName[] {
  const raw = (value ?? "").trim() || "checkov,trivy";
  const parts = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
  const scanners: ScannerName[] = [];
  for (const part of parts) {
    if (part !== "checkov" && part !== "trivy") {
      throw new ConfigError(`Unknown scanner "${part}". Use checkov, trivy, or both.`);
    }
    if (!scanners.includes(part)) scanners.push(part);
  }
  if (scanners.length === 0) {
    throw new ConfigError("At least one scanner is required.");
  }
  return scanners;
}

function parseScanMode(value: string | undefined): "changed" | "all" {
  const mode = (value ?? "").trim().toLowerCase() || "changed";
  if (mode === "changed" || mode === "all") return mode;
  throw new ConfigError('scan_mode must be "changed" or "all".');
}

function parsePaths(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().replace(/^\.\//, "").replace(/\/$/, ""))
    .filter((part) => part !== "" && part !== ".");
}

function parseBaseUrl(value: string | undefined): string {
  const raw = (value ?? "").trim() || "https://api.openai.com/v1";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("openai_base_url must be an absolute http(s) URL.");
  }
  if (url.username || url.password) {
    throw new ConfigError("openai_base_url must not include credentials.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError("openai_base_url must be http or https.");
  }
  return raw.replace(/\/+$/, "");
}

function parseModel(value: string | undefined): string {
  const model = (value ?? "").trim() || "gpt-4o-mini";
  if (model.length > 100) throw new ConfigError("openai_model must be 100 characters or fewer.");
  return model;
}

function parseFailOn(value: string | undefined): FailOn {
  const raw = (value ?? "").trim().toLowerCase() || "none";
  if (raw === "none") return "none";
  if (isSeverity(raw)) return raw satisfies Severity;
  throw new ConfigError("fail_on must be none, low, medium, high, or critical.");
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigError(`${name} must be true or false.`);
}

function parseIntInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const raw = (value ?? "").trim();
  if (raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}
