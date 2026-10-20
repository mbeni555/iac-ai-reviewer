# Roadmap

v0.1 is a pull request reviewer: Checkov and Trivy, an optional OpenAI-compatible explanation, and one comment that updates in place. The milestones below are the path from that review to something a small team would pay for. Dates are not attached. The order is the dependency order.

## v0.1 — Reviewer on the pull request

Shipped in this repository.

- Checkov and Trivy against Terraform and Kubernetes files
- Pluggable LLM interface, OpenAI-compatible endpoint first
- No-key path that still posts a comment
- Redacted snippets, never whole files
- Single comment, updated on re-run
- Sample vulnerable module and a workflow that scans it
- Unit tests for parsing, ranking, and comment formatting

## v0.2 — Signal over noise

The sample module produces dozens of findings for a handful of real mistakes. v0.2 is about making the comment shorter and the policy explicit.

- Dedupe Checkov and Trivy findings that describe the same resource and the same mistake
- A `.iac-ai-reviewer.yml` policy file: suppress a check id, raise a check id, or fail the build on a path
- Optional `install_scanners` so the quick start does not copy the pip and curl steps
- SARIF upload to GitHub code scanning, beside the comment
- Inline review comments on the flagged line, in addition to the summary
- A second provider that does not speak chat completions, behind the same `LlmProvider` interface

## v0.3 — Hosted dashboard for a small team

The GitHub Action stays free and open source. A hosted tier is for teams that want the history without running the model key in every repo.

- An organization view of findings over time: which checks recur, which repos improved
- A shared policy, instead of a file copied into every repository
- Auth for a small team, with the Action sending a summary rather than holding the only copy
- The model key lives in the hosted service, not in each repo's secrets

This milestone is a product, not a workflow file. It should not block improvements to the Action.

## v0.4 — Azure DevOps

- A pipeline task that runs the same review core and posts to an Azure DevOps pull request
- The comment marker and the no-key behavior stay the same
- SARIF, if the host can ingest it

## Good first issues

These are sized so a new contributor can finish one without designing the hosted tier.

1. **Dedupe across scanners.** Same file, overlapping lines, and a shared resource should collapse a Checkov id and a Trivy id into one card that lists both ids. Needs a fixture from `examples/` and a test that the comment contains one public-ACL card instead of two.
2. **`install_scanners` input.** When true, the action installs the pinned Checkov and Trivy releases if they are missing, and fails with the current message if the install fails. The default stays false so a workflow's supply chain does not change underneath it.
3. **Policy file skeleton.** Read `.iac-ai-reviewer.yml` with `ignore: [{ id, reason }]`. Ignored ids disappear from the comment and from `fail_on`, and the comment lists what was ignored. No remote policy yet.
4. **SARIF writer.** Turn `RenderedFinding` into a SARIF 2.1.0 document and write it to a file output. Uploading it with `github/codeql-action/upload-sarif` can be a follow-up if the writer is tested on its own.
5. **Anthropic provider.** Implement `LlmProvider` against the Messages API. The OpenAI provider, the prompt's JSON shape, and the no-key path stay as they are.

Issues 3 and 4 are the first slices of policy-as-code and SARIF. They are intentionally smaller than the milestone titles.
