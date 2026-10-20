import { describe, expect, it, vi } from "vitest";

import type { LlmProvider } from "./llm/provider";
import { LLM_FIELD_ALLOWLIST, toLlmPayload } from "./llm/payload";
import { buildReview } from "./review";
import type { RawFinding, SanitizedFinding } from "./types";

const SECRET = "AKIAIOSFODNN7EXAMPLE";

function lines(): string {
  const body = Array.from({ length: 100 }, (_, index) => `line ${index + 1} ok`);
  body[0] = "SENTINEL_TOP";
  body[49] = 'resource "aws_s3_bucket" "logs" {';
  body[50] = `  api_key = "${SECRET}"`;
  body[51] = "}";
  body[99] = "SENTINEL_BOTTOM";
  return body.join("\n");
}

function raw(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    scanner: "checkov",
    checkId: "CKV_AWS_20",
    title: "S3 Bucket has an ACL defined which allows public READ access.",
    file: "examples/terraform/open-bucket.tf",
    startLine: 50,
    endLine: 52,
    resource: "aws_s3_bucket.logs",
    guidelineUrl: "https://example.test/ckv-aws-20",
    ...overrides,
  };
}

async function reviewWith(options: {
  raw?: RawFinding[];
  llm?: LlmProvider | null;
  llmConfigured?: boolean;
  maxFindings?: number;
  maxExplained?: number;
  text?: string;
}) {
  const text = options.text ?? lines();
  return buildReview({
    raw: options.raw ?? [raw()],
    filesScanned: ["examples/terraform/open-bucket.tf"],
    scanners: ["checkov"],
    workspace: "/workspace",
    llm: options.llm ?? null,
    llmConfigured: options.llmConfigured ?? false,
    model: "gpt-4o-mini",
    providerHost: "api.openai.com",
    maxFindings: options.maxFindings ?? 30,
    maxExplained: options.maxExplained ?? 8,
    maxSnippetLines: 30,
    maxSnippetChars: 800,
    readFile: async () => ({ bytes: text.length, text }),
  });
}

describe("buildReview", () => {
  it("redacts the snippet, drops the rest of the file, and ranks without an LLM", async () => {
    const seen: SanitizedFinding[] = [];
    const llm: LlmProvider = {
      name: "fake",
      explain: vi.fn(async (findings: readonly SanitizedFinding[]) => {
        seen.push(...findings);
        return findings.map((finding) => ({
          id: finding.id,
          risk: "critical" as const,
          reason: "Anyone on the internet can read this bucket.",
          summary: "The ACL is public-read.",
          fix: 'acl = "private"',
        }));
      }),
    };
    const built = await reviewWith({ llm, llmConfigured: true });
    expect(seen).toHaveLength(1);
    const payload = toLlmPayload(seen[0]!);
    expect(Object.keys(payload).sort()).toEqual([...LLM_FIELD_ALLOWLIST].sort());
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("SENTINEL_TOP");
    expect(serialized).not.toContain("SENTINEL_BOTTOM");
    expect(serialized).toContain("[REDACTED]");
    expect(built.usedLlm).toBe(true);
    expect(built.comment).toContain("Anyone on the internet can read this bucket.");
    expect(built.comment).not.toContain(SECRET);
    expect(built.findings[0]?.risk).toBe("critical");
  });

  it("uses the same comment format when no key is configured", async () => {
    const built = await reviewWith({});
    expect(built.mode).toBe("no-key");
    expect(built.usedLlm).toBe(false);
    expect(built.comment).toContain("No LLM API key was set");
    expect(built.comment).toContain("CKV_AWS_20");
    expect(built.comment).toContain("https://example.test/ckv-aws-20");
    expect(built.findings[0]?.risk).toBe("critical");
    expect(built.comment).not.toContain(SECRET);
  });

  it("falls back to scanner text when the model fails", async () => {
    const llm: LlmProvider = {
      name: "fake",
      explain: async () => {
        throw new Error("LLM request failed with HTTP 401: invalid key sk-test");
      },
    };
    const built = await reviewWith({ llm, llmConfigured: true });
    expect(built.mode).toBe("llm-failed");
    expect(built.comment).toContain("HTTP 401");
    expect(built.comment).toContain("Follow the scanner guideline");
    expect(built.findings[0]?.fromLlm).toBe(false);
  });

  it("keeps the highest baseline risk when the list is capped", async () => {
    const built = await reviewWith({
      maxFindings: 1,
      maxExplained: 1,
      raw: [
        raw({ checkId: "CKV_AWS_18", title: "logging", startLine: 1, endLine: 1 }),
        raw({ checkId: "CKV_AWS_20", title: "public acl", startLine: 50, endLine: 52 }),
      ],
    });
    expect(built.findings).toHaveLength(1);
    expect(built.findings[0]?.checkId).toBe("CKV_AWS_20");
    expect(built.omittedCount).toBe(1);
    expect(built.comment).toContain("1 additional");
  });

  it("does not read a path outside the workspace", async () => {
    const readFile = vi.fn(async () => ({ bytes: 10, text: `api_key = "${SECRET}"` }));
    const built = await buildReview({
      raw: [raw({ file: "../etc/passwd" })],
      filesScanned: [],
      scanners: ["checkov"],
      workspace: "/workspace",
      llm: null,
      llmConfigured: false,
      maxFindings: 10,
      maxExplained: 5,
      maxSnippetLines: 30,
      maxSnippetChars: 800,
      readFile,
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(built.findings[0]?.snippet).toMatch(/outside the workspace/);
  });

  it("keeps scanner text for ids the model skipped", async () => {
    const llm: LlmProvider = {
      name: "fake",
      explain: async (findings) => [
        {
          id: findings[0]?.id ?? "missing",
          risk: "high",
          reason: "Public ACL.",
          summary: "Change the ACL.",
          fix: 'acl = "private"',
        },
      ],
    };
    const built = await reviewWith({
      llm,
      llmConfigured: true,
      raw: [raw(), raw({ checkId: "CKV_AWS_24", title: "SSH open", startLine: 10, endLine: 12, severity: "HIGH" })],
    });
    expect(built.usedLlm).toBe(true);
    expect(built.findings.filter((item) => item.fromLlm)).toHaveLength(1);
    expect(built.comment).toContain("1 finding kept the scanner text");
  });
});
