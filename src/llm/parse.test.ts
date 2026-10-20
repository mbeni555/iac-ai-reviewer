import { describe, expect, it } from "vitest";

import { parseExplanationPayload } from "./parse";

describe("parseExplanationPayload", () => {
  it("parses a fenced JSON object and normalizes risk", () => {
    const text = [
      "Here you go:",
      "```json",
      JSON.stringify({
        explanations: [
          {
            id: "checkov:CKV_AWS_20:examples/terraform/open-bucket.tf:7:14",
            risk: "High",
            reason: "Anyone can read the objects.",
            summary: "The canned ACL is public-read.",
            fix: 'acl = "private"',
          },
        ],
      }),
      "```",
    ].join("\n");
    const parsed = parseExplanationPayload(text);
    expect(parsed).toEqual([
      {
        id: "checkov:CKV_AWS_20:examples/terraform/open-bucket.tf:7:14",
        risk: "high",
        reason: "Anyone can read the objects.",
        summary: "The canned ACL is public-read.",
        fix: 'acl = "private"',
      },
    ]);
  });

  it("drops entries that are missing a valid risk and redacts secrets in the fix", () => {
    const parsed = parseExplanationPayload(
      JSON.stringify({
        explanations: [
          { id: "bad", risk: "severe", reason: "x", summary: "y", fix: "z" },
          {
            id: "good",
            risk: "critical",
            reason: "Open SSH.",
            summary: "Port 22 is public.",
            fix: 'api_key = "AKIAIOSFODNN7EXAMPLE"\nacl = "private"',
          },
        ],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("good");
    expect(parsed[0]?.fix).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("rejects prose that is not JSON", () => {
    expect(() => parseExplanationPayload("I would rate this high.")).toThrow(/JSON/);
  });
});
