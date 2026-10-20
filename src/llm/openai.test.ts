import { describe, expect, it, vi } from "vitest";

import type { SanitizedFinding } from "../types";
import { chatCompletionsUrl, createOpenAiProvider } from "./openai";

function finding(id: string): SanitizedFinding {
  return {
    id,
    scanner: "trivy",
    checkId: "AWS-0107",
    title: "SSH open",
    description: "Port 22 is open.",
    file: "sg.tf",
    startLine: 8,
    endLine: 12,
    snippet: "   8 | cidr_blocks = [\"0.0.0.0/0\"]",
    baselineRisk: "critical",
    baselineReason: "SSH is open.",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createOpenAiProvider", () => {
  it("batches findings and caps tokens", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const sent = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const user = sent.messages[1];
      const payload = JSON.parse(user?.content ?? "{}") as { findings: Array<{ id: string }> };
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanations: payload.findings.map((item) => ({
                  id: item.id,
                  risk: "critical",
                  reason: "Open to the internet.",
                  summary: "Tighten the CIDR.",
                  fix: 'cidr_blocks = ["10.0.0.0/16"]',
                })),
              }),
            },
          },
        ],
      });
    });
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 1200,
      batchSize: 2,
      jsonMode: true,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await provider.explain([finding("a"), finding("b"), finding("c")]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
    const first = bodies[0] as { max_tokens: number; model: string; response_format?: { type: string } };
    expect(first.max_tokens).toBe(1200);
    expect(first.model).toBe("gpt-4o-mini");
    expect(first.response_format).toEqual({ type: "json_object" });
    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
  });

  it("retries once without JSON mode when the server returns 400", async () => {
    const modes: Array<string | undefined> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { response_format?: { type: string } };
      modes.push(body.response_format?.type);
      if (body.response_format) return jsonResponse({ error: "json mode unsupported" }, 400);
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanations: [
                  { id: "a", risk: "high", reason: "Because.", summary: "Do this.", fix: "Set it." },
                ],
              }),
            },
          },
        ],
      });
    });
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      baseUrl: "https://example.test/v1/",
      model: "local",
      maxTokens: 256,
      batchSize: 5,
      jsonMode: true,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await provider.explain([finding("a")]);
    expect(modes).toEqual(["json_object", undefined]);
    expect(result[0]?.risk).toBe("high");
    expect(chatCompletionsUrl("https://example.test/v1/")).toBe("https://example.test/v1/chat/completions");
  });
});
