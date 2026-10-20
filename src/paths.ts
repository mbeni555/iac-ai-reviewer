import { isAbsolute, relative, resolve } from "path";

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function toRepoRelative(filePath: string, repoRoot: string): string {
  if (isAbsolute(filePath)) {
    const rel = relative(repoRoot, filePath);
    if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) {
      return normalizePath(rel);
    }
  }
  return normalizePath(filePath);
}

export function isInsideRepo(repoRoot: string, filePath: string): boolean {
  const root = resolve(repoRoot);
  const abs = resolve(repoRoot, filePath);
  const rel = relative(root, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function isTerraformFile(filePath: string): boolean {
  const path = normalizePath(filePath).toLowerCase();
  return path.endsWith(".tf") || path.endsWith(".tf.json");
}

export function isYamlFile(filePath: string): boolean {
  const path = normalizePath(filePath).toLowerCase();
  return path.endsWith(".yml") || path.endsWith(".yaml");
}

export function looksLikeKubernetes(content: string): boolean {
  const head = content.slice(0, 8000);
  return /(^|\n)\s*apiVersion\s*:/.test(head) && /(^|\n)\s*kind\s*:/.test(head);
}

export function matchesPathPrefix(filePath: string, prefixes: readonly string[]): boolean {
  if (prefixes.length === 0) return true;
  const file = normalizePath(filePath);
  return prefixes.some((prefix) => {
    const normalized = normalizePath(prefix).replace(/\/$/, "");
    return normalized === "" || file === normalized || file.startsWith(`${normalized}/`);
  });
}

export function isScannableStatus(status: string): boolean {
  return status !== "removed" && status !== "unchanged";
}

export function fenceLanguage(filePath: string): string {
  const path = filePath.toLowerCase();
  if (path.endsWith(".tf") || path.endsWith(".tf.json") || path.endsWith(".hcl")) return "hcl";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "";
}
