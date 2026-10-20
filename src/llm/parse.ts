import { asString, isRecord } from "../json";
import { redact } from "../redact";
import { oneLine, stripFence, truncate } from "../text";
import { isSeverity, type Explanation } from "../types";

export function parseExplanationPayload(text: string): Explanation[] {
  const parsed = parseModelJson(text);
  const list = explanationList(parsed);
  const explanations: Explanation[] = [];
  for (const item of list) {
    const explanation = parseOne(item);
    if (explanation) explanations.push(explanation);
  }
  return explanations;
}

function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    }
    const arrayStart = candidate.indexOf("[");
    const arrayEnd = candidate.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(candidate.slice(arrayStart, arrayEnd + 1)) as unknown;
    }
    throw new Error("The model did not return JSON.");
  }
}

function explanationList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) throw new Error("The model JSON was not an object.");
  const list = parsed.explanations ?? parsed.findings ?? parsed.results;
  if (!Array.isArray(list)) throw new Error("The model JSON did not include explanations.");
  return list;
}

function parseOne(value: unknown): Explanation | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id) ?? asString(value.findingId);
  const riskText = (asString(value.risk) ?? asString(value.severity) ?? "").toLowerCase();
  const reason = asString(value.reason);
  const summary = asString(value.summary) ?? asString(value.explanation);
  const fix = asString(value.fix) ?? asString(value.remediation);
  if (!id || !reason || !summary || !fix || !isSeverity(riskText)) return null;
  return {
    id,
    risk: riskText,
    reason: redact(oneLine(reason, 180)),
    summary: redact(truncate(summary.trim(), 600)),
    fix: redact(truncate(stripFence(fix), 800)),
  };
}
