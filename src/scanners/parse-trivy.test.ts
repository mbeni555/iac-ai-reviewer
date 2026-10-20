import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import { parseTrivyOutput, resolveTrivyTarget } from "./parse-trivy";

describe("parseTrivyOutput", () => {
  it("maps misconfigurations onto repo-relative files and keeps scanner severity", () => {
    const json = JSON.parse(readFileSync("src/scanners/fixtures/trivy-examples.json", "utf8")) as unknown;
    const allow = new Set([
      "examples/kubernetes/privileged-pod.yaml",
      "examples/terraform/open-bucket.tf",
      "examples/terraform/open-security-group.tf",
    ]);
    const findings = parseTrivyOutput(json, "examples", "/workspace", allow);
    const byId = new Map(findings.map((finding) => [finding.checkId + finding.file, finding]));
    expect(findings.map((finding) => finding.checkId)).toEqual([
      "KSV-0010",
      "KSV-0017",
      "KSV-0023",
      "AWS-0092",
      "AWS-0104",
      "AWS-0107",
    ]);
    expect(byId.get("AWS-0104examples/terraform/open-security-group.tf")).toMatchObject({
      severity: "CRITICAL",
      file: "examples/terraform/open-security-group.tf",
      resolution: expect.stringContaining("cidr"),
    });
    expect(byId.get("KSV-0017examples/kubernetes/privileged-pod.yaml")?.description).toMatch(/privileged/i);
    expect(JSON.stringify(findings)).not.toContain("\"Code\"");
  });

  it("drops results outside the requested file set and passed checks", () => {
    const json = {
      Results: [
        {
          Target: "open-bucket.tf",
          Misconfigurations: [
            {
              ID: "AWS-0092",
              Title: "public acl",
              Severity: "HIGH",
              Status: "PASS",
              CauseMetadata: { StartLine: 1, EndLine: 2 },
            },
            {
              ID: "AWS-0086",
              Title: "block public acl",
              Severity: "HIGH",
              Status: "FAIL",
              Message: "Block it.",
              Resolution: "Set the flag.",
              CauseMetadata: { StartLine: 4, EndLine: 8, Resource: "aws_s3_bucket.logs" },
            },
          ],
        },
        {
          Target: "other.tf",
          Misconfigurations: [
            { ID: "AWS-0001", Title: "elsewhere", Severity: "LOW", Status: "FAIL" },
          ],
        },
      ],
    };
    const findings = parseTrivyOutput(json, "examples/terraform", "/workspace", new Set(["examples/terraform/open-bucket.tf"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkId: "AWS-0086",
      file: "examples/terraform/open-bucket.tf",
      resource: "aws_s3_bucket.logs",
      description: "Block it.",
    });
  });
});

describe("resolveTrivyTarget", () => {
  it("joins the scan directory and the result target", () => {
    expect(resolveTrivyTarget("examples/terraform", "open-bucket.tf", "/workspace")).toBe(
      "examples/terraform/open-bucket.tf",
    );
    expect(resolveTrivyTarget("examples", "kubernetes/privileged-pod.yaml", "/workspace")).toBe(
      "examples/kubernetes/privileged-pod.yaml",
    );
  });
});
