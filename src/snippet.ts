export interface SnippetWindow {
  snippet: string;
  startLine: number;
  endLine: number;
}

export function extractSnippet(
  content: string,
  startLine: number | undefined,
  endLine: number | undefined,
  maxLines: number,
): SnippetWindow {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const total = Math.max(lines.length, 1);
  const requestedStart = clampLine(startLine ?? 1, total);
  const requestedEnd = Math.max(requestedStart, clampLine(endLine ?? requestedStart, total));
  const context = 2;
  let start = Math.max(1, requestedStart - context);
  let end = Math.min(total, requestedEnd + context);
  const cap = Math.max(1, maxLines);
  if (end - start + 1 > cap) {
    end = Math.min(total, start + cap - 1);
  }
  const body = lines.slice(start - 1, end).map((line, index) => {
    const number = String(start + index).padStart(4, " ");
    return `${number} | ${line}`;
  });
  return {
    snippet: body.join("\n"),
    startLine: start,
    endLine: end,
  };
}

function clampLine(line: number, total: number): number {
  if (!Number.isFinite(line) || line < 1) return 1;
  return Math.min(Math.floor(line), total);
}
