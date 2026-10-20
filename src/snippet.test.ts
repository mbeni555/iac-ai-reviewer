import { describe, expect, it } from "vitest";

import { extractSnippet } from "./snippet";

describe("extractSnippet", () => {
  it("keeps a small window around the finding and numbers the lines", () => {
    const lines = Array.from({ length: 100 }, (_, index) => `line ${index + 1} ok`);
    lines[0] = "SENTINEL_TOP";
    lines[49] = 'resource "aws_s3_bucket" "logs" {';
    lines[50] = '  acl = "public-read"';
    lines[51] = "}";
    lines[99] = "SENTINEL_BOTTOM";
    const snippet = extractSnippet(lines.join("\n"), 50, 52, 30);
    expect(snippet.snippet).toContain('acl = "public-read"');
    expect(snippet.snippet).not.toContain("SENTINEL_TOP");
    expect(snippet.snippet).not.toContain("SENTINEL_BOTTOM");
    expect(snippet.snippet.split("\n").length).toBeLessThanOrEqual(30);
    expect(snippet.startLine).toBe(48);
  });

  it("caps the window at maxLines", () => {
    const content = Array.from({ length: 40 }, (_, index) => `row ${index + 1}`).join("\n");
    const snippet = extractSnippet(content, 1, 40, 5);
    expect(snippet.snippet.split("\n")).toHaveLength(5);
  });
});
