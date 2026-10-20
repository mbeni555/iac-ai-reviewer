import { describe, expect, it, vi } from "vitest";

import { parseConfig } from "./config";
import { execute, type CommentClient, type Logger } from "./execute";
import type { LlmProvider } from "./llm/provider";
import { COMMENT_MARKER } from "./comment";
import type { RawFinding } from "./types";

function logger(): Logger & { outputs: Record<string, string>; summaries: string[] } {
  const outputs: Record<string, string> = {};
  const summaries: string[] = [];
  return {
    outputs,
    summaries,
    info: vi.fn(),
    warning: vi.fn(),
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    setSecret: vi.fn(),
    writeSummary: async (markdown) => {
      summaries.push(markdown);
    },
  };
}

function comments(): CommentClient & { created: string[]; updated: Array<{ id: number; body: string }>; deleted: number[] } {
  const created: string[] = [];
  const updated: Array<{ id: number; body: string }> = [];
  const deleted: number[] = [];
  let listed: Array<{ id: number; body: string }> = [];
  const client: CommentClient & { created: string[]; updated: typeof updated; deleted: number[]; setListed: (v: typeof listed) => void } = {
    created,
    updated,
    deleted,
    setListed: (value) => {
      listed = value;
    },
    list: async () => listed,
    create: async (body) => {
      created.push(body);
      return "https://example.test/comment/1";
    },
    update: async (id, body) => {
      updated.push({ id, body });
      return "https://example.test/comment/2";
    },
    delete: async (id) => {
      deleted.push(id);
    },
  };
  return client;
}

const finding: RawFinding = {
  scanner: "trivy",
  checkId: "AWS-0104",
  title: "Unrestricted egress",
  severity: "CRITICAL",
  file: "examples/terraform/open-security-group.tf",
  startLine: 25,
  endLine: 30,
  resource: "aws_security_group.web",
  resolution: "Set a tighter CIDR.",
};

describe("execute", () => {
  it("creates a comment, then updates it and deletes duplicates", async () => {
    const log = logger();
    const client = comments() as ReturnType<typeof comments> & { setListed: (v: Array<{ id: number; body: string }>) => void };
    const first = await execute({
      config: parseConfig({ comment: "true", failOn: "none" }),
      workspace: "/workspace",
      pullRequestNumber: 12,
      discoverFiles: async () => ["examples/terraform/open-security-group.tf"],
      scanners: [{ name: "trivy", scan: async () => [finding] }],
      comments: client,
      readFile: async () => ({ bytes: 20, text: 'cidr_blocks = ["0.0.0.0/0"]\n' }),
      log,
      llm: null,
    });
    expect(client.created).toHaveLength(1);
    expect(client.created[0]).toContain(COMMENT_MARKER);
    expect(first.commentUrl).toContain("https://");
    expect(first.failed).toBe(false);
    expect(log.outputs.highest_severity).toBe("critical");
    expect(log.outputs.used_llm).toBe("false");
    expect(log.summaries[0]).toContain("AWS-0104");

    client.setListed([
      { id: 2, body: client.created[0] ?? "" },
      { id: 8, body: `${COMMENT_MARKER}\nold duplicate` },
    ]);
    const second = await execute({
      config: parseConfig({ comment: "true" }),
      workspace: "/workspace",
      pullRequestNumber: 12,
      discoverFiles: async () => ["examples/terraform/open-security-group.tf"],
      scanners: [{ name: "trivy", scan: async () => [finding] }],
      comments: client,
      readFile: async () => ({ bytes: 20, text: 'cidr_blocks = ["0.0.0.0/0"]\n' }),
      log,
      llm: null,
    });
    expect(second.commentUrl).toContain("/comment/2");
    expect(client.updated.map((item) => item.id)).toEqual([2]);
    expect(client.deleted).toEqual([8]);
    expect(client.created).toHaveLength(1);
  });

  it("does not call scanners or the model when nothing is in scope", async () => {
    const scan = vi.fn(async () => [finding]);
    const explain = vi.fn(async () => []);
    const llm: LlmProvider = { name: "fake", explain };
    const log = logger();
    const result = await execute({
      config: parseConfig({ comment: "false", openaiApiKey: "sk-test" }),
      workspace: "/workspace",
      pullRequestNumber: null,
      discoverFiles: async () => [],
      scanners: [{ name: "checkov", scan }],
      comments: null,
      readFile: async () => ({ bytes: 0 }),
      log,
      llm,
    });
    expect(scan).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();
    expect(result.findingsCount).toBe(0);
    expect(result.highest).toBe("none");
    expect(result.commentBody).toContain("No misconfigurations");
    expect(log.outputs.files_scanned).toBe("0");
  });

  it("posts the comment before failing the job", async () => {
    const client = comments();
    const log = logger();
    const result = await execute({
      config: parseConfig({ failOn: "high", comment: "true" }),
      workspace: "/workspace",
      pullRequestNumber: 4,
      discoverFiles: async () => ["examples/terraform/open-security-group.tf"],
      scanners: [{ name: "trivy", scan: async () => [finding] }],
      comments: client,
      readFile: async () => ({ bytes: 12, text: "cidr_blocks = [\"0.0.0.0/0\"]\n" }),
      log,
      llm: null,
    });
    expect(client.created).toHaveLength(1);
    expect(result.failed).toBe(true);
    expect(result.failureMessage).toMatch(/fail_on=high/);
    expect(log.summaries).toHaveLength(1);
  });
});
