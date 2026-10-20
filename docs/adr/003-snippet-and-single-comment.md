# ADR 003: Snippets only, and one comment

Date: 2026-10-20
Status: Accepted

## Context

Two ways to leak more than we meant: send the scanner's copy of the file to the model, and post a new comment on every push. Checkov JSON includes `code_block` and, for Terraform, the parsed resource entity. Trivy JSON includes the offending lines under `CauseMetadata.Code`. Both are convenient and both are the wrong source for a prompt, because they are not passed through our redactor and they are not bounded by our window.

GitHub has a checks API and a code-scanning API. Both are a better long-term home for findings than an issue comment. Neither is required to make the review readable on a pull request this week.

## Decision

The parsers keep check id, title, severity, path, line range, resource, guideline, and remediation. They drop embedded source. The action then reads the file from the workspace, takes the line range plus two lines of context, redacts, and truncates. Files over 512 KB and paths outside the workspace contribute a finding with the snippet omitted.

The comment starts with `<!-- iac-ai-reviewer -->`. On a re-run the action updates the oldest comment that contains the marker and deletes newer duplicates that also contain it. The body is also written to the job summary, so a `workflow_dispatch` run is visible without a pull request.

SARIF upload to the code scanning tab is a later milestone. The comment stays the v0.1 surface so the action is useful before that work.

## Consequences

- A check that depends on another file for context can be explained from a partial snippet. That is accepted. The path and resource address are still included.
- Regex redaction can miss a secret. `SECURITY.md` says so, and `.tfvars` are out of scope so the obvious credential file is not in the prompt.
- Deleting duplicate marker comments will remove an older bot comment a human replied under only if that human comment is a separate comment. Replies on the thread are a different API and are left alone. A person who edited the bot comment keeps their edit only until the next run, which replaces the body.
- Inline review comments, one per line, are not in v0.1. The summary would still exist beside them.
