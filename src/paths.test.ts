import { describe, expect, it } from "vitest";

import { isInsideRepo, looksLikeKubernetes, matchesPathPrefix, toRepoRelative } from "./paths";

describe("paths", () => {
  it("relativizes absolute paths that stay inside the repo", () => {
    expect(toRepoRelative("/workspace/examples/terraform/open-bucket.tf", "/workspace")).toBe(
      "examples/terraform/open-bucket.tf",
    );
  });

  it("rejects paths that escape the workspace", () => {
    expect(isInsideRepo("/workspace", "examples/terraform/open-bucket.tf")).toBe(true);
    expect(isInsideRepo("/workspace", "../etc/passwd")).toBe(false);
    expect(isInsideRepo("/workspace", "/etc/passwd")).toBe(false);
  });

  it("recognizes Kubernetes manifests and ignores GitHub workflow files", () => {
    const manifest = "apiVersion: v1\nkind: Pod\nmetadata:\n  name: debug\n";
    const workflow = "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n";
    expect(looksLikeKubernetes(manifest)).toBe(true);
    expect(looksLikeKubernetes(workflow)).toBe(false);
  });

  it("matches path prefixes", () => {
    expect(matchesPathPrefix("examples/terraform/open-bucket.tf", ["examples"])).toBe(true);
    expect(matchesPathPrefix("src/index.ts", ["examples"])).toBe(false);
    expect(matchesPathPrefix("examples/terraform/open-bucket.tf", [])).toBe(true);
  });
});
