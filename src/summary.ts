import { writeFile } from "fs/promises";
import { join } from "path";

export const SUMMARY_FILENAME = "iac-ai-reviewer-summary.md";

/**
 * Copy the review markdown to a stable file.
 *
 * `$GITHUB_STEP_SUMMARY` is a different file for every step, and the runner
 * deletes the previous step's file before the next step starts. Callers that
 * need to assert on the job summary text read this copy instead.
 */
export async function writeSummaryCopy(
  markdown: string,
  directory: string | undefined,
): Promise<string | undefined> {
  if (!directory) return undefined;
  const path = join(directory, SUMMARY_FILENAME);
  await writeFile(path, markdown);
  return path;
}
