export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export function oneLine(text: string, maxChars: number): string {
  return truncate(text.replace(/\s+/g, " ").trim(), maxChars);
}

export function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  const width = Math.max(1, size);
  for (let index = 0; index < items.length; index += width) {
    batches.push(items.slice(index, index + width));
  }
  return batches;
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return oneLine(message, 240);
}
