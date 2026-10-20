export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Scanner returned empty output.");
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectAt = trimmed.indexOf("{");
    const arrayAt = trimmed.indexOf("[");
    const starts = [objectAt, arrayAt].filter((index) => index >= 0);
    if (starts.length === 0) {
      throw new Error("Scanner returned non-JSON output.");
    }
    const start = Math.min(...starts);
    try {
      return JSON.parse(trimmed.slice(start)) as unknown;
    } catch {
      throw new Error("Scanner returned non-JSON output.");
    }
  }
}
