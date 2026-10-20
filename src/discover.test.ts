import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { collectFiles } from "./discover";

describe("collectFiles", () => {
  it("keeps Terraform and Kubernetes files and skips workflows, tfvars, and dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "iac-discover-"));
    await mkdir(join(root, "examples/terraform"), { recursive: true });
    await mkdir(join(root, "examples/kubernetes"), { recursive: true });
    await mkdir(join(root, ".github/workflows"), { recursive: true });
    await mkdir(join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(join(root, "examples/terraform/main.tf"), 'resource "null_resource" "x" {}\n');
    await writeFile(join(root, "examples/terraform/secrets.tfvars"), 'password = "nope"\n');
    await writeFile(
      join(root, "examples/kubernetes/pod.yaml"),
      "apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\n",
    );
    await writeFile(join(root, ".github/workflows/ci.yml"), "name: CI\non: push\n");
    await writeFile(join(root, "node_modules/pkg/main.tf"), 'resource "null_resource" "y" {}\n');

    const collected = await collectFiles(root, ["examples"], 100);
    expect(collected.files).toEqual(["examples/kubernetes/pod.yaml", "examples/terraform/main.tf"]);
    expect(collected.truncated).toBe(false);
  });
});
