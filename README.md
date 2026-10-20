# IaC AI Reviewer

[![CI](https://github.com/mbeni555/iac-ai-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/mbeni555/iac-ai-reviewer/actions/workflows/ci.yml)

Pull request reviews for Terraform and Kubernetes stall on check ids. Checkov and Trivy already know that an S3 ACL is public, that `0.0.0.0/0` is on port 22, or that a pod is privileged. They do not say, in the language of the person who opened the pull request, what can happen, how bad it is, and what to change.

IaC AI Reviewer runs those scanners on the files in the pull request, then asks an LLM for that explanation. The model ranks each finding critical, high, medium, or low, with a one-line reason, and suggests a concrete code change. The action posts **one** comment and updates that same comment on the next push.

No API key is required. With an empty `openai_api_key` the action posts the same comment shape, filled with scanner severity (or a small built-in map when the scanner omits severity) and the scanner's own guidance. The free path always runs.

This is the open-source action. A hosted view for a small team is on the [roadmap](ROADMAP.md), not in this release.

## What a review looks like

`examples/` is deliberately vulnerable: a public S3 bucket, a security group open to the internet, and a privileged pod that shares the host network, the host PID namespace, and the host root filesystem. `.github/workflows/iac-review-demo.yml` installs Checkov 3.3.29 and Trivy 0.76.0 and runs this action against that directory.

With those versions and no model key, the sample produces 73 findings. The default cap keeps the 30 highest: **12 critical and 18 high**. The other 43 are counted and left out. The dummy access key id in the bucket tags is rewritten to `[REDACTED]` before it is written anywhere. The job stays green because the demo sets `fail_on: none`. A real pipeline should set `fail_on: high`.

The comment opens with those counts. The first full cards are the privileged pod, then the public bucket. This is the bucket card from that run:

````markdown
<!-- iac-ai-reviewer -->
## IaC AI Reviewer

**30 findings** in 3 files · Checkov and Trivy

| Severity | Findings |
| --- | ---: |
| Critical | 12 |
| High | 18 |
| Medium | 0 |
| Low | 0 |

_43 additional findings were left out because of `max_findings`. The ones below are the highest baseline risk._

No LLM API key was set. Risk comes from scanner severity when the scanner provides it, otherwise from a built-in map of well-known checks. The guidance below is the scanner's own text.

### Critical — CKV_AWS_20 — S3 Bucket has an ACL defined which allows public READ access.

Checkov · `examples/terraform/open-bucket.tf:7` · `aws_s3_bucket.logs`

**Why it matters.** A public S3 ACL lets anyone on the internet read the bucket.

**What to change.**

Follow the scanner guideline: https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/s3-policies/s3-1-acl-read-permissions-everyone

<details>
<summary>Redacted snippet</summary>

```hcl
   7 | resource "aws_s3_bucket" "logs" {
   8 |   bucket = "demo-public-logs"
   9 |
  10 |   tags = {
  11 |     Owner   = "platform"
  12 |     api_key = "[REDACTED]"
  13 |   }
  14 | }
```

</details>
````

Further down, the same comment lists the scanners' other hits in a table, including Trivy:

| Severity | Check | Location | Finding |
| --- | --- | --- | --- |
| Critical | `AWS-0104` | `examples/terraform/open-security-group.tf:29` | A security group rule should not allow unrestricted egress to any IP address. |
| High | `KSV-0017` | `examples/kubernetes/privileged-pod.yaml:12` | Privileged |

Trivy findings carry the scanner's own remediation sentence (for `AWS-0104`, "Set a more restrictive cidr range"). Open-source Checkov does not fill `severity` or a remediation sentence unless a commercial key is configured, so the no-key rank for those ids comes from the built-in map and the "what to change" line is the guideline URL. That behavior is covered in [ADR 002](docs/adr/002-pluggable-llm.md).

### With an API key

The renderer does not change. The model replaces the reason, the paragraph, and the fix, and it may disagree with the scanner. Only the first `max_explained` findings (default 8) are sent, in batches, after redaction. This block is the shape of that output, not a captured model call:

````markdown
Plain-English notes below are from `gpt-4o-mini`.

### Critical — CKV_AWS_20 — S3 Bucket has an ACL defined which allows public READ access.

Checkov · `examples/terraform/open-bucket.tf:7` · `aws_s3_bucket.logs`

**Why it matters.** Anyone on the internet can read every object in this bucket.

The canned ACL is public-read, and the public access block under it has all four flags set to false, so the ACL is not ignored.

**What to change.**

```hcl
resource "aws_s3_bucket_acl" "logs" {
  bucket = aws_s3_bucket.logs.id
  acl    = "private"
}
```

---

Only a redacted snippet and the finding metadata were sent to api.openai.com.
````

If the call fails, the comment still posts and the footer says the model was skipped. The job is not failed because the model was down.

## Quick start

The action does not install Checkov or Trivy. Pin them in the workflow so a scanner release cannot change your review overnight. From this repository, `uses: ./` is the action. After you publish a tag, replace that line with `mbeni555/iac-ai-reviewer@v0.1.0`.

```yaml
name: IaC review
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install Checkov
        run: pip install 'checkov==3.3.29'

      - name: Install Trivy
        run: |
          curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b "$HOME/.local/bin" v0.76.0
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      - uses: ./
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          fail_on: high
```

Leave `openai_api_key` unset, or set the secret to an empty value, and the no-key path runs. `scan_mode` defaults to `changed`, which on a pull request reviews Terraform and Kubernetes files the pull request touches. It does not review `.tfvars`.

The self-demo is [`.github/workflows/iac-review-demo.yml`](.github/workflows/iac-review-demo.yml). It scans `examples/` on every pull request, on pushes to `main`, and on `workflow_dispatch`. A later step checks that three files were scanned, that the highest risk is critical, and that `AKIAIOSFODNN7EXAMPLE` is absent from the review markdown. That markdown is what the action writes to the job summary. The check reads the `summary_file` output, because `$GITHUB_STEP_SUMMARY` is a different file in each step and the runner removes the previous one.

Fork pull requests cannot post the comment with the default token. This action does not switch to `pull_request_target`.

`openai_base_url` is any OpenAI-compatible chat completions root (`https://api.openai.com/v1`, a gateway, or a local server). The request is `POST {base}/chat/completions` with a bearer token. JSON mode is on by default and retried once without `response_format` if the server returns HTTP 400.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `scanners` | `checkov,trivy` | `checkov`, `trivy`, or both. |
| `scan_mode` | `changed` | `changed` uses the pull request file list. `all` walks `paths`. Outside a pull request, `changed` falls back to `all` and warns. |
| `paths` | empty | Comma-separated prefixes. Empty means the repo, still filtered to Terraform and Kubernetes. |
| `openai_api_key` | empty | Bearer token. Empty skips the model. |
| `openai_base_url` | `https://api.openai.com/v1` | API root. No userinfo in the URL. |
| `openai_model` | `gpt-4o-mini` | Model name. |
| `openai_json_mode` | `true` | Send `response_format: json_object`. |
| `max_findings` | `30` | Findings kept, highest baseline risk first. |
| `max_explained` | `8` | How many of those get a full card and, when a key is set, a model call. |
| `max_snippet_lines` | `30` | Lines around the finding, including two lines of context. |
| `max_snippet_chars` | `800` | Snippet length after redaction. |
| `llm_batch_size` | `5` | Findings per request. |
| `llm_max_tokens` | `1200` | `max_tokens` on each request. Temperature is 0. |
| `max_files` | `100` | Cap on files scanned. |
| `fail_on` | `none` | `none`, `low`, `medium`, `high`, or `critical`. The comment is posted first. |
| `github_token` | `${{ github.token }}` | Read changed files and upsert the comment. |
| `comment` | `true` | Set `false` to skip the comment. The job summary is still written. |

## Outputs

| Output | Meaning |
| --- | --- |
| `findings_count` | Findings included in the comment. |
| `omitted_count` | Findings dropped by `max_findings`. |
| `files_scanned` | Terraform and Kubernetes files in scope. |
| `highest_severity` | Worst risk shown, or `none`. |
| `used_llm` | `true` when the model produced explanations. |
| `comment_url` | The created or updated comment. Empty when no comment was posted. |
| `summary_file` | Path of the review markdown written to the job summary. Empty when `RUNNER_TEMP` is unset. |

## Privacy

The model never receives a whole file, a `.tfvars` file, the Actions environment, or the API key. It receives the allowlisted metadata plus the redacted line window. Checkov's embedded `code_block` and Trivy's embedded code are discarded and the file is read again, so those copies cannot bypass redaction. Files over 512 KB and paths outside the workspace are not read into the prompt.

Redaction is a regex backstop for private keys, `AKIA` access key ids, GitHub and Slack tokens, bearer tokens, and assignments to names like `password`, `secret`, and `api_key`. It will miss secrets that do not look like those. Details, limits, and the sample key are in [SECURITY.md](SECURITY.md).

The job log records paths and counts, not snippets.

## Development

Node.js 20 or newer.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Commit `dist/index.js` with source changes. CI installs the pinned scanners, runs the tests (the integration test scans `examples/` when the binaries are on `PATH`), typechecks, rebuilds, and fails if `dist/` drifted.

## Design notes

- [ADR 001](docs/adr/001-typescript-javascript-action.md) — TypeScript action, scanners on `PATH`, not a container
- [ADR 002](docs/adr/002-pluggable-llm.md) — one provider interface, cost caps, no-key fallback
- [ADR 003](docs/adr/003-snippet-and-single-comment.md) — snippets only, one comment updated in place
- [Roadmap](ROADMAP.md) — SARIF, policy-as-code, a hosted dashboard, Azure DevOps
- [Why I built this](docs/build-in-public/01-why-i-built-this.md) and a [LinkedIn draft](docs/build-in-public/linkedin-post.md)

## License

[MIT](LICENSE)
