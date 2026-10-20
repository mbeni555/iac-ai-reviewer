import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";

import {
  isTerraformFile,
  isYamlFile,
  looksLikeKubernetes,
  normalizePath,
} from "./paths";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".github",
  ".terraform",
  "node_modules",
  "dist",
  "coverage",
  ".external_modules",
]);

export interface CollectedFiles {
  files: string[];
  missingPrefixes: string[];
  truncated: boolean;
}

export async function collectFiles(
  repoRoot: string,
  prefixes: readonly string[],
  maxFiles: number,
): Promise<CollectedFiles> {
  const starts = prefixes.length > 0 ? prefixes : ["."];
  const found: string[] = [];
  const missingPrefixes: string[] = [];

  for (const prefix of starts) {
    const start = join(repoRoot, prefix);
    try {
      const info = await stat(start);
      if (info.isFile()) {
        await consider(repoRoot, start, found);
        continue;
      }
      if (!info.isDirectory()) {
        missingPrefixes.push(prefix);
        continue;
      }
    } catch {
      missingPrefixes.push(prefix);
      continue;
    }
    await walk(repoRoot, start, found);
  }

  found.sort();
  const unique = [...new Set(found)];
  const limit = Math.max(1, maxFiles);
  return {
    files: unique.slice(0, limit),
    missingPrefixes,
    truncated: unique.length > limit,
  };
}

async function walk(repoRoot: string, directory: string, found: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(repoRoot, full, found);
      continue;
    }
    if (!entry.isFile()) continue;
    await consider(repoRoot, full, found);
  }
}

async function consider(repoRoot: string, full: string, found: string[]): Promise<void> {
  const rel = normalizePath(relative(repoRoot, full));
  if (isTerraformFile(rel)) {
    found.push(rel);
    return;
  }
  if (!isYamlFile(rel)) return;
  const content = await readFile(full, "utf8");
  if (looksLikeKubernetes(content)) found.push(rel);
}
