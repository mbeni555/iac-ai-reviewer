import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";

import { buildReview } from "./review";
import { readFile } from "fs/promises";
import { stat } from "fs/promises";
import { join } from "path";
import { runCheckov, runTrivy } from "./scanners/run";
import type { LlmProvider } from "./llm/provider";
import { toLlmPayload } from "./llm/payload";
import { isInsideRepo } from "./paths";

const SECRET = "AKIAIOSFODNN7EXAMPLE";
const ROOT = process.cwd();

function hasBin(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const scannersReady = hasBin("checkov") && hasBin("trivy");

describe("scanner integration", () => {
  it.skipIf(!scannersReady)("scans the vulnerable sample and never forwards the dummy key", async () => {
    const files = [
      "examples/terraform/open-bucket.tf",
      "examples/terraform/open-security-group.tf",
      "examples/kubernetes/privileged-pod.yaml",
    ];
    const [checkov, trivy] = await Promise.all([runCheckov(files, ROOT), runTrivy(files, ROOT)]);
    const ids = new Set([...checkov, ...trivy].map((finding) => finding.checkId));
    expect(ids.has("CKV_AWS_20") || ids.has("AWS-0092")).toBe(true);
    expect(ids.has("CKV_AWS_24") || ids.has("AWS-0107")).toBe(true);
    expect(ids.has("CKV_K8S_16") || ids.has("KSV-0017")).toBe(true);

    const seen: string[] = [];
    const llm: LlmProvider = {
      name: "fake",
      explain: async (findings) => {
        for (const finding of findings) seen.push(JSON.stringify(toLlmPayload(finding)));
        return findings.map((finding) => ({
          id: finding.id,
          risk: finding.baselineRisk,
          reason: "Reviewed in the integration test.",
          summary: finding.title,
          fix: "Apply the scanner's recommended change.",
        }));
      },
    };
    const built = await buildReview({
      raw: [...checkov, ...trivy],
      filesScanned: files,
      scanners: ["checkov", "trivy"],
      workspace: ROOT,
      llm,
      llmConfigured: true,
      model: "fake",
      providerHost: "example.test",
      maxFindings: 30,
      maxExplained: 8,
      maxSnippetLines: 30,
      maxSnippetChars: 800,
      readFile: async (file) => {
        if (!isInsideRepo(ROOT, file)) return { bytes: 0 };
        const full = join(ROOT, file);
        const info = await stat(full);
        return { bytes: info.size, text: await readFile(full, "utf8") };
      },
    });
    expect(built.findings.length).toBeGreaterThan(0);
    expect(["critical", "high"]).toContain(built.findings[0]?.risk);
    const blob = `${built.comment}\n${seen.join("\n")}`;
    expect(blob).not.toContain(SECRET);
    expect(built.comment).toContain("<!-- iac-ai-reviewer -->");
  });
});
