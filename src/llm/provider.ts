import type { Explanation, SanitizedFinding } from "../types";

export interface LlmProvider {
  readonly name: string;
  explain(findings: readonly SanitizedFinding[]): Promise<Explanation[]>;
}

export interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  batchSize: number;
  jsonMode: boolean;
  fetchImpl?: typeof fetch;
}
