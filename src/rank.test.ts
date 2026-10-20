import { describe, expect, it } from "vitest";

import { baselineRisk, highestSeverity, shouldFail } from "./rank";

describe("baselineRisk", () => {
  it("trusts scanner severity over the built-in map", () => {
    const ranked = baselineRisk({ checkId: "CKV_AWS_20", severity: "HIGH" });
    expect(ranked.risk).toBe("high");
    expect(ranked.reason).toBe("Scanner severity is high.");
  });

  it("uses the built-in map when Checkov omits severity", () => {
    expect(baselineRisk({ checkId: "CKV_AWS_20", severity: null }).risk).toBe("critical");
    expect(baselineRisk({ checkId: "CKV_K8S_16" }).risk).toBe("critical");
    expect(baselineRisk({ checkId: "CKV_AWS_18" }).risk).toBe("low");
  });

  it("ranks unknown checks as medium", () => {
    const ranked = baselineRisk({ checkId: "CKV_UNKNOWN_1", title: "Something new" });
    expect(ranked.risk).toBe("medium");
    expect(ranked.reason).toMatch(/did not report a severity/);
  });

  it("maps unknown scanner severities only through the known vocabulary", () => {
    expect(baselineRisk({ checkId: "AWS-0104", severity: "CRITICAL" }).risk).toBe("critical");
    expect(baselineRisk({ checkId: "KSV-0012", severity: "LOW" }).risk).toBe("low");
  });
});

describe("shouldFail", () => {
  it("fails when the highest risk meets the threshold", () => {
    expect(shouldFail("critical", "high")).toBe(true);
    expect(shouldFail("high", "high")).toBe(true);
    expect(shouldFail("medium", "high")).toBe(false);
    expect(shouldFail("low", "low")).toBe(true);
    expect(shouldFail(null, "high")).toBe(false);
    expect(shouldFail("critical", "none")).toBe(false);
  });
});

describe("highestSeverity", () => {
  it("returns the worst risk", () => {
    expect(highestSeverity(["low", "high", "medium"])).toBe("high");
    expect(highestSeverity([])).toBeNull();
  });
});
