# ADR 001: TypeScript JavaScript action

Date: 2026-10-20
Status: Accepted

## Context

The reviewer has to parse two scanner JSON formats, redact snippets, call an HTTP API, and update one pull request comment. Those steps need unit tests with the model and the GitHub API mocked. The action also has to start quickly on a pull request.

A composite action would shell out to Checkov and Trivy, then do the JSON, redaction, and comment work in bash. That logic is where the bugs will be, and bash is a poor place to test it.

A Docker action can pin Checkov and Trivy inside the image, which is a real convenience. It also means a cold image pull on every job, an image we have to rebuild for every scanner CVE, and a harder path for the unit tests that matter here (ranking, redaction, comment formatting).

## Decision

Ship a TypeScript action that runs on the Node 20 runner (`runs.using: node20`). Checkov and Trivy stay on `PATH`, installed by the workflow. The action bundles to `dist/index.js` with esbuild so the workflow does not need a compile step.

The orchestration in `execute` takes scanners, a comment client, and an LLM provider as arguments. Tests call that function directly.

## Consequences

- The quick start has two install steps. An `install_scanners` input can hide them later without changing the review pipeline.
- The supported runner for v0.1 is `ubuntu-latest`. Windows and macOS paths are not part of the CI install snippets.
- `dist/index.js` is committed. CI rebuilds it and fails if the commit drifted.
- Scanner versions are pinned in the README and in CI, not inside an image tag.
