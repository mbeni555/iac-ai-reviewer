import { isSeverity, severityRank, type Severity } from "./types";

const SCANNER_SEVERITY: Record<string, Severity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  UNKNOWN: "low",
  INFO: "low",
  NONE: "low",
};

/**
 * Open-source Checkov leaves severity empty unless a commercial API key is
 * configured. These ids are the ones a reviewer should not have to wait on a
 * model to treat as serious. Scanner-provided severity always wins when present.
 */
const FALLBACK: Record<string, { risk: Severity; reason: string }> = {
  CKV_AWS_20: {
    risk: "critical",
    reason: "A public S3 ACL lets anyone on the internet read the bucket.",
  },
  CKV_AWS_53: {
    risk: "critical",
    reason: "Block Public ACLs is off, so a public ACL can be applied later.",
  },
  CKV_AWS_54: {
    risk: "critical",
    reason: "Block Public Policy is off, so a public bucket policy can stick.",
  },
  CKV_AWS_55: {
    risk: "critical",
    reason: "Ignore Public ACLs is off, so an existing public ACL still grants access.",
  },
  CKV_AWS_56: {
    risk: "critical",
    reason: "Restrict Public Buckets is off, so a public policy can expose objects.",
  },
  CKV2_AWS_6: {
    risk: "critical",
    reason: "This bucket has no public access block, so public ACLs and policies are allowed.",
  },
  CKV_AWS_24: {
    risk: "critical",
    reason: "SSH is open to 0.0.0.0/0, which is scanned constantly.",
  },
  CKV_AWS_25: {
    risk: "critical",
    reason: "RDP is open to 0.0.0.0/0.",
  },
  CKV_AWS_277: {
    risk: "critical",
    reason: "This security group accepts all protocols from the whole internet.",
  },
  CKV_AWS_260: {
    risk: "high",
    reason: "Port 80 accepts traffic from 0.0.0.0/0.",
  },
  CKV_AWS_382: {
    risk: "high",
    reason: "Egress is open to every address, so a foothold can talk to the internet freely.",
  },
  CKV_AWS_145: {
    risk: "high",
    reason: "The bucket is not encrypted with a customer-managed key.",
  },
  CKV_AWS_18: {
    risk: "low",
    reason: "Access logging is off. Useful for forensics, not an exposure by itself.",
  },
  CKV_AWS_21: {
    risk: "medium",
    reason: "Versioning is off, so overwrites and deletes are harder to recover.",
  },
  CKV_AWS_23: {
    risk: "low",
    reason: "A security group rule is missing a description.",
  },
  CKV_AWS_144: {
    risk: "low",
    reason: "Cross-region replication is not configured.",
  },
  CKV2_AWS_5: {
    risk: "low",
    reason: "This security group is not attached to another resource.",
  },
  CKV2_AWS_61: {
    risk: "low",
    reason: "The bucket has no lifecycle configuration.",
  },
  CKV2_AWS_62: {
    risk: "low",
    reason: "The bucket has no event notifications.",
  },
  CKV_K8S_16: {
    risk: "critical",
    reason: "A privileged container can escape onto the node.",
  },
  CKV_K8S_17: {
    risk: "critical",
    reason: "hostPID exposes host processes to the container.",
  },
  CKV_K8S_19: {
    risk: "high",
    reason: "hostNetwork puts the container on the node's network.",
  },
  CKV_K8S_20: {
    risk: "high",
    reason: "allowPrivilegeEscalation lets the process gain more privileges.",
  },
  CKV_K8S_23: {
    risk: "high",
    reason: "The container can run as root.",
  },
  CKV_K8S_8: { risk: "low", reason: "No liveness probe is configured." },
  CKV_K8S_9: { risk: "low", reason: "No readiness probe is configured." },
  CKV_K8S_10: { risk: "low", reason: "CPU requests are not set." },
  CKV_K8S_11: { risk: "low", reason: "CPU limits are not set." },
  CKV_K8S_12: { risk: "low", reason: "Memory requests are not set." },
  CKV_K8S_13: { risk: "low", reason: "Memory limits are not set." },
  CKV_K8S_15: { risk: "low", reason: "The image pull policy is not Always." },
  CKV_K8S_22: {
    risk: "medium",
    reason: "The root filesystem is writable.",
  },
  CKV_K8S_28: {
    risk: "medium",
    reason: "The container keeps the NET_RAW capability.",
  },
  CKV_K8S_29: {
    risk: "medium",
    reason: "The pod security context is incomplete.",
  },
  CKV_K8S_31: {
    risk: "medium",
    reason: "No seccomp profile is set.",
  },
  CKV_K8S_37: {
    risk: "medium",
    reason: "The container does not drop Linux capabilities.",
  },
  CKV_K8S_38: {
    risk: "low",
    reason: "The service account token is mounted by default.",
  },
  CKV_K8S_40: {
    risk: "low",
    reason: "The container UID is not forced into a high range.",
  },
  CKV_K8S_43: {
    risk: "low",
    reason: "The image is pinned by tag instead of digest.",
  },
  CKV2_K8S_6: {
    risk: "medium",
    reason: "No NetworkPolicy was found for this pod.",
  },
  "AWS-0086": {
    risk: "critical",
    reason: "Public ACLs are not blocked on this bucket.",
  },
  "AWS-0087": {
    risk: "critical",
    reason: "Public bucket policies are not blocked.",
  },
  "AWS-0091": {
    risk: "critical",
    reason: "Public ACLs are not ignored.",
  },
  "AWS-0092": {
    risk: "critical",
    reason: "The bucket ACL allows public access.",
  },
  "AWS-0093": {
    risk: "critical",
    reason: "Public bucket access is not restricted.",
  },
  "AWS-0104": {
    risk: "critical",
    reason: "The security group allows unrestricted egress.",
  },
  "AWS-0107": {
    risk: "critical",
    reason: "SSH or RDP is open to the internet.",
  },
  "KSV-0017": {
    risk: "critical",
    reason: "Privileged mode shares the host's namespaces with the container.",
  },
  "KSV-0010": {
    risk: "critical",
    reason: "The pod shares the host PID namespace.",
  },
  "KSV-0009": {
    risk: "high",
    reason: "The pod shares the host network namespace.",
  },
};

export interface BaselineRank {
  risk: Severity;
  reason: string;
}

export function baselineRisk(input: {
  checkId: string;
  severity?: string | null;
  title?: string;
}): BaselineRank {
  const reported = (input.severity ?? "").trim().toUpperCase();
  if (reported && SCANNER_SEVERITY[reported]) {
    const risk = SCANNER_SEVERITY[reported];
    return {
      risk,
      reason: `Scanner severity is ${reported.toLowerCase()}.`,
    };
  }
  const known = FALLBACK[input.checkId.trim().toUpperCase()];
  if (known) return known;
  return {
    risk: "medium",
    reason: "Scanner did not report a severity, so this stays at medium until it is reviewed.",
  };
}

export function highestSeverity(risks: readonly Severity[]): Severity | null {
  let best: Severity | null = null;
  for (const risk of risks) {
    if (best === null || severityRank(risk) < severityRank(best)) best = risk;
  }
  return best;
}

export function shouldFail(highest: Severity | null, threshold: string): boolean {
  if (threshold === "none" || highest === null) return false;
  if (!isSeverity(threshold)) return false;
  return severityRank(highest) <= severityRank(threshold);
}

export function compareRiskThenLocation(
  left: { risk: Severity; file: string; startLine: number },
  right: { risk: Severity; file: string; startLine: number },
): number {
  const byRisk = severityRank(left.risk) - severityRank(right.risk);
  if (byRisk !== 0) return byRisk;
  if (left.file !== right.file) return left.file < right.file ? -1 : 1;
  return left.startLine - right.startLine;
}
