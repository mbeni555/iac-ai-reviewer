import { describe, expect, it } from "vitest";

import { buildCheckovArgs, buildTrivyArgs, directoriesOf, frameworksFor } from "./run";

describe("scanner arguments", () => {
  it("asks Checkov for JSON, no downloads, and only the IaC frameworks in the file set", () => {
    const args = buildCheckovArgs([
      "examples/terraform/open-bucket.tf",
      "examples/kubernetes/privileged-pod.yaml",
    ]);
    expect(args).toEqual([
      "--quiet",
      "--soft-fail",
      "--skip-results-upload",
      "--download-external-modules",
      "false",
      "-o",
      "json",
      "--framework",
      "terraform,kubernetes",
      "-f",
      "examples/terraform/open-bucket.tf",
      "-f",
      "examples/kubernetes/privileged-pod.yaml",
    ]);
    expect(frameworksFor(["main.tf"])).toEqual(["terraform"]);
  });

  it("runs Trivy once per directory", () => {
    expect(buildTrivyArgs("examples/terraform")).toContain("examples/terraform");
    expect(buildTrivyArgs("examples/terraform")).toContain("--disable-telemetry");
    expect(directoriesOf(["examples/terraform/a.tf", "examples/terraform/b.tf", "examples/kubernetes/pod.yaml"])).toEqual([
      "examples/terraform",
      "examples/kubernetes",
    ]);
  });
});
