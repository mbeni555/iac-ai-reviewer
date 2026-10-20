import { describe, expect, it } from "vitest";

import { ConfigError, parseConfig } from "./config";

describe("parseConfig", () => {
  it("applies the documented defaults", () => {
    const config = parseConfig({});
    expect(config).toMatchObject({
      scanners: ["checkov", "trivy"],
      scanMode: "changed",
      paths: [],
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      jsonMode: true,
      maxFindings: 30,
      maxExplained: 8,
      maxSnippetLines: 30,
      maxSnippetChars: 800,
      batchSize: 5,
      maxTokens: 1200,
      maxFiles: 100,
      failOn: "none",
      comment: true,
    });
  });

  it("clamps explanations to the finding cap and rejects bad input", () => {
    expect(parseConfig({ maxFindings: "3", maxExplained: "9" }).maxExplained).toBe(3);
    expect(parseConfig({ scanners: "trivy", scanMode: "all", comment: "false", failOn: "high" })).toMatchObject({
      scanners: ["trivy"],
      scanMode: "all",
      comment: false,
      failOn: "high",
    });
    expect(() => parseConfig({ scanners: "snyk" })).toThrow(ConfigError);
    expect(() => parseConfig({ openaiBaseUrl: "https://user:secret@example.test/v1" })).toThrow(/credentials/);
    expect(() => parseConfig({ failOn: "urgent" })).toThrow(ConfigError);
    expect(() => parseConfig({ llmMaxTokens: "10" })).toThrow(/llm_max_tokens/);
  });
});
