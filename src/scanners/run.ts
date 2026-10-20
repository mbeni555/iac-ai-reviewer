import { getExecOutput } from "@actions/exec";
import { which } from "@actions/io";
import { dirname } from "path";

import { parseJsonText } from "../json";
import { isTerraformFile, isYamlFile, normalizePath } from "../paths";
import type { RawFinding, ScannerName } from "../types";
import { parseCheckovOutput } from "./parse-checkov";
import { parseTrivyOutput } from "./parse-trivy";

export class ScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScannerError";
  }
}

export function missingScannerMessage(name: string): string {
  if (name === "checkov") {
    return "checkov is not on PATH. Install it in an earlier step: pip install 'checkov==3.3.29'";
  }
  if (name === "trivy") {
    return "trivy is not on PATH. Install the pinned release in an earlier step. The README quick start has the command.";
  }
  return `${name} is not on PATH.`;
}

export function frameworksFor(files: readonly string[]): string[] {
  const frameworks = new Set<string>();
  for (const file of files) {
    if (isTerraformFile(file)) frameworks.add("terraform");
    if (isYamlFile(file)) frameworks.add("kubernetes");
  }
  return [...frameworks];
}

export function buildCheckovArgs(files: readonly string[]): string[] {
  const args = [
    "--quiet",
    "--soft-fail",
    "--skip-results-upload",
    "--download-external-modules",
    "false",
    "-o",
    "json",
  ];
  const frameworks = frameworksFor(files);
  if (frameworks.length > 0) {
    args.push("--framework", frameworks.join(","));
  }
  for (const file of files) {
    args.push("-f", file);
  }
  return args;
}

export function buildTrivyArgs(directory: string): string[] {
  return [
    "config",
    "--format",
    "json",
    "--exit-code",
    "0",
    "--quiet",
    "--skip-version-check",
    "--disable-telemetry",
    directory,
  ];
}

export function directoriesOf(files: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    const dir = dirname(file);
    dirs.add(dir === "" ? "." : normalizePath(dir));
  }
  return [...dirs];
}

export async function runCheckov(files: readonly string[], cwd: string): Promise<RawFinding[]> {
  if (files.length === 0) return [];
  const json = await execJson("checkov", buildCheckovArgs(files), cwd);
  return parseCheckovOutput(json, cwd);
}

export async function runTrivy(files: readonly string[], cwd: string): Promise<RawFinding[]> {
  if (files.length === 0) return [];
  const allow = new Set(files.map((file) => normalizePath(file)));
  const findings: RawFinding[] = [];
  for (const directory of directoriesOf(files)) {
    const json = await execJson("trivy", buildTrivyArgs(directory), cwd);
    findings.push(...parseTrivyOutput(json, directory, cwd, allow));
  }
  return findings;
}

export async function assertOnPath(bin: ScannerName | string): Promise<void> {
  try {
    await which(bin, true);
  } catch {
    throw new ScannerError(missingScannerMessage(bin));
  }
}

async function execJson(bin: string, args: string[], cwd: string): Promise<unknown> {
  await assertOnPath(bin);
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await getExecOutput(bin, args, {
      cwd,
      ignoreReturnCode: true,
      silent: true,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ScannerError(`${bin} could not be started. ${detail}`);
  }
  try {
    return parseJsonText(result.stdout);
  } catch {
    const stderr = result.stderr.trim().slice(0, 500);
    const suffix = stderr ? ` ${stderr}` : "";
    throw new ScannerError(`${bin} exited ${result.exitCode} and did not return JSON.${suffix}`);
  }
}
