# Security

IaC AI Reviewer reads infrastructure code in order to review it. This document is the contract for what leaves the runner.

## What the action is allowed to send to a model

An LLM call happens only when `openai_api_key` is non-empty. Each request contains a batch of findings, and each finding is reduced to this allowlist:

- stable id, scanner name, check id, title
- scanner description, truncated
- repo-relative path, start line, end line, resource address
- scanner severity, when the scanner provided one
- a redacted snippet: the finding's line range, two lines of context, capped by `max_snippet_lines` and `max_snippet_chars`

The payload builder is `toLlmPayload` in `src/llm/payload.ts`. Unit tests lock the key set. The system prompt tells the model that the snippet is untrusted and that instructions inside it must be ignored.

## What is never sent

- The whole file, or any line outside that window
- Files larger than 512 KB (the snippet is omitted instead of being read into the prompt)
- Paths that resolve outside the workspace
- Checkov's embedded `code_block` and parsed HCL `entity`. Those objects often contain more source than the finding. The parser drops them and the action reads the line window itself
- Trivy's `CauseMetadata.Code` block, for the same reason
- `.tfvars` files. They are a common place for real credentials and are not in the default file set
- The Actions environment, `github_token`, or the LLM API key
- Checkov's secrets framework. The action passes `--framework terraform` and/or `kubernetes` only

Snippets and model text are passed through `redact` before they are sent and again before they are written into the pull request comment. The redactor is regex-based. It catches common shapes (private keys, `AKIA` access key ids, GitHub and Slack tokens, bearer tokens, and assignments to `password`, `secret`, `api_key`, `token`, and similar names). It will miss secrets that do not match those shapes. Treat redaction as a backstop, not a guarantee, and do not rely on it as a secrets scanner.

The job log records file paths and finding counts. It does not record snippets or the request body. `core.setSecret` masks `openai_api_key` if it ever appears in an Actions log line.

## Pull request comment

The comment is the same text as the job summary. It includes the redacted snippet inside a collapsed section so a reviewer can see what was judged. The comment is an issue comment on the pull request, not a review comment on a line. Re-runs find the comment by the marker `<!-- iac-ai-reviewer -->`, update the oldest match, and delete later duplicates that carry the same marker.

`fail_on` is applied after the comment is published, so a failing check still leaves the review on the pull request.

## Runner permissions

The workflow needs:

- `contents: read` to check out the code
- `pull-requests: write` to list changed files and to create, update, and delete the summary comment

The default `github.token` is enough for pull requests from the same repository. Pull requests from forks do not receive a token that can write comments. This action does not use `pull_request_target`, because that checks out untrusted code with a privileged token.

Checkov and Trivy are not downloaded by the action. You install them in earlier steps, which keeps their supply chain in the workflow you review. Pin the versions. The quick start pins Checkov 3.3.29 and Trivy 0.76.0. Trivy still contacts its check-bundle registry unless the checks are already cached. Checkov is invoked with `--download-external-modules false` and `--skip-results-upload`, so it does not fetch Terraform modules and it does not upload the scan to Bridgecrew even if a Bridgecrew token is present in the job. `--skip-download` is intentionally not set: in Checkov 3.3.29 that flag also strips the guideline URL from the JSON, and the no-key comment uses that URL as the remediation link.

## Sample files

`examples/` is deliberately vulnerable. `examples/terraform/open-bucket.tf` contains the string `AKIAIOSFODNN7EXAMPLE`, which is Amazon's published example access key id, not a live credential. It exists so tests can prove the key does not reach the model payload or the comment. Do not replace it with a real secret.

## Reporting a vulnerability

Please do not open a public issue for a security problem in this action. Use GitHub's private vulnerability reporting on the repository. If private reporting is not enabled yet, contact the maintainers listed on the repository profile.
