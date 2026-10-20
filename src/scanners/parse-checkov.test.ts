import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import { parseCheckovOutput } from "./parse-checkov";

describe("parseCheckovOutput", () => {
  it("reads a multi-framework report and ignores embedded source", () => {
    const json = JSON.parse(readFileSync("src/scanners/fixtures/checkov-multi.json", "utf8")) as unknown;
    const findings = parseCheckovOutput(json, "/workspace");
    expect(findings.map((finding) => finding.checkId)).toEqual(["CKV_K8S_16", "CKV_AWS_20"]);
    const bucket = findings.find((finding) => finding.checkId === "CKV_AWS_20");
    expect(bucket).toMatchObject({
      scanner: "checkov",
      file: "examples/terraform/open-bucket.tf",
      startLine: 7,
      endLine: 14,
      resource: "aws_s3_bucket.logs",
      guidelineUrl: expect.stringContaining("https://"),
    });
    expect(JSON.stringify(findings)).not.toContain("code_block");
  });

  it("does not copy code blocks or parsed HCL entities into the finding", () => {
    const json = JSON.parse(readFileSync("src/scanners/fixtures/checkov-with-code-block.json", "utf8")) as unknown;
    const findings = parseCheckovOutput(json, "/workspace");
    expect(findings).toHaveLength(1);
    expect(JSON.stringify(findings)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("returns nothing for an empty report", () => {
    expect(parseCheckovOutput({ results: { failed_checks: [] } }, "/workspace")).toEqual([]);
    expect(parseCheckovOutput("nope", "/workspace")).toEqual([]);
  });
});
