import { describe, expect, it } from "vitest";

import { COMMENT_MARKER, limitComment, partitionMarkerComments, renderComment } from "./comment";
import type { RenderedFinding } from "./types";

function finding(overrides: Partial<RenderedFinding> = {}): RenderedFinding {
  return {
    id: "checkov:CKV_AWS_20:examples/terraform/open-bucket.tf:7:14",
    scanner: "checkov",
    checkId: "CKV_AWS_20",
    title: "S3 Bucket has an ACL defined which allows public READ access.",
    file: "examples/terraform/open-bucket.tf",
    startLine: 7,
    endLine: 14,
    resource: "aws_s3_bucket.logs",
    risk: "critical",
    reason: "A public S3 ACL lets anyone on the internet read the bucket.",
    summary: "The canned ACL on the logs bucket is public-read.",
    fix: 'acl = "private"',
    snippet: '  12 | api_key = "[REDACTED]"',
    detailed: true,
    fromLlm: false,
    ...overrides,
  };
}

describe("renderComment", () => {
  it("renders scanner findings in the shared comment shape", () => {
    const body = renderComment({
      findings: [
        finding(),
        finding({
          id: "low",
          checkId: "CKV_AWS_18",
          title: "Ensure the S3 bucket has access logging enabled",
          risk: "low",
          reason: "Access logging is off.",
          summary: "Enable access logging.",
          fix: "Add an aws_s3_bucket_logging resource.",
          detailed: false,
          startLine: 7,
        }),
      ],
      filesScanned: ["examples/terraform/open-bucket.tf"],
      scanners: ["checkov", "trivy"],
      omittedCount: 2,
      mode: "no-key",
      partialCount: 0,
    });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain("**2 findings**");
    expect(body).toContain("| Critical | 1 |");
    expect(body).toContain("| Low | 1 |");
    expect(body).toContain("### Critical — CKV_AWS_20");
    expect(body).toContain("**Why it matters.**");
    expect(body).toContain("**What to change.**");
    expect(body).toContain("No LLM API key was set");
    expect(body).toContain("### Also flagged");
    expect(body).toContain("`CKV_AWS_18`");
    expect(body).toContain("2 additional findings were left out");
    expect(body).not.toContain("AKIA");
    expect(body.match(/iac-ai-reviewer/g)).toHaveLength(1);
  });

  it("names the model when explanations came from an LLM", () => {
    const body = renderComment({
      findings: [finding({ fromLlm: true, fix: 'acl = "private"\n# block public access' })],
      filesScanned: ["examples/terraform/open-bucket.tf"],
      scanners: ["checkov"],
      omittedCount: 0,
      mode: "llm",
      model: "gpt-4o-mini",
      providerHost: "api.openai.com",
      partialCount: 1,
    });
    expect(body).toContain("`gpt-4o-mini`");
    expect(body).toContain("api.openai.com");
    expect(body).toContain("1 finding kept the scanner text");
    expect(body).toContain("```hcl");
  });

  it("does not wrap a long guideline URL in a code fence", () => {
    const url = `https://docs.prismacloud.io/${"s3-policy/".repeat(20)}`;
    const body = renderComment({
      findings: [finding({ fix: `Follow the scanner guideline: ${url}` })],
      filesScanned: ["examples/terraform/open-bucket.tf"],
      scanners: ["checkov"],
      omittedCount: 0,
      mode: "no-key",
      partialCount: 0,
    });
    expect(body).toContain(url);
    expect(body).not.toContain("```hcl\nFollow the scanner guideline");
  });

  it("says when the model call failed", () => {
    const body = renderComment({
      findings: [finding()],
      filesScanned: ["examples/kubernetes/privileged-pod.yaml"],
      scanners: ["trivy"],
      omittedCount: 0,
      mode: "llm-failed",
      llmError: "LLM request failed with HTTP 401",
      partialCount: 0,
    });
    expect(body).toContain("HTTP 401");
    expect(body).toContain("Showing scanner findings instead");
  });

  it("covers the empty scan", () => {
    const body = renderComment({
      findings: [],
      filesScanned: [],
      scanners: ["checkov"],
      omittedCount: 0,
      mode: "no-key",
      partialCount: 0,
    });
    expect(body).toContain("No misconfigurations");
    expect(body).toContain(COMMENT_MARKER);
  });
});

describe("partitionMarkerComments", () => {
  it("keeps the oldest marker comment and marks later copies for deletion", () => {
    const { keep, extras } = partitionMarkerComments([
      { id: 4, body: "unrelated" },
      { id: 9, body: `${COMMENT_MARKER}\nsecond` },
      { id: 2, body: `${COMMENT_MARKER}\nfirst` },
    ]);
    expect(keep?.id).toBe(2);
    expect(extras.map((comment) => comment.id)).toEqual([9]);
  });

  it("returns null when the marker is absent", () => {
    expect(partitionMarkerComments([{ id: 1, body: "hello" }]).keep).toBeNull();
  });
});

describe("limitComment", () => {
  it("truncates overlong comments", () => {
    const body = limitComment("a".repeat(100), 40);
    expect(body.length).toBeLessThanOrEqual(40);
    expect(body).toContain("truncated");
  });
});
