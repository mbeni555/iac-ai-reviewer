import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { SUMMARY_FILENAME, writeSummaryCopy } from "./summary";

describe("writeSummaryCopy", () => {
  it("returns undefined when there is no directory", async () => {
    expect(await writeSummaryCopy("## IaC AI Reviewer\n", undefined)).toBeUndefined();
    expect(await writeSummaryCopy("## IaC AI Reviewer\n", "")).toBeUndefined();
  });

  it("writes the review markdown to a stable filename", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iac-summary-"));
    const markdown = "## IaC AI Reviewer\n\napi_key = \"[REDACTED]\"\n";
    const path = await writeSummaryCopy(markdown, directory);
    expect(path).toBe(join(directory, SUMMARY_FILENAME));
    expect(await readFile(path ?? "", "utf8")).toBe(markdown);
  });
});
