# ADR 002: One LLM interface, OpenAI-compatible first

Date: 2026-10-20
Status: Accepted

## Context

The useful part of the review is a plain-English explanation, a real-world risk, and a concrete fix. That call should be replaceable. A team may use OpenAI, a gateway, or a local server that speaks the same chat-completions API. The free path has to work with no key at all, because a portfolio action that fails closed without a secret is not something a small team will try.

Cost is part of the design. A pull request can produce dozens of Checkov and Trivy findings for one resource. Sending every one, with the whole file, to a large model is how the bill shows up.

## Decision

`LlmProvider` has one method, `explain(findings)`. v0.1 ships a single implementation: HTTP `POST {base}/chat/completions` with a bearer token. There is no provider SDK.

Defaults that keep a run small:

- model `gpt-4o-mini`
- at most 8 findings are explained (`max_explained`)
- those are sent in batches of 5 (`llm_batch_size`)
- `max_tokens` is 1200 per request
- temperature is 0
- snippets are already capped before they are serialized

JSON mode is on by default. A single HTTP 400 is retried without `response_format`, so a compatible server that rejects JSON mode still works.

If the key is empty, the provider is not constructed and no socket is opened. If the call throws, times out, or returns ids we did not send, the comment is still published, using scanner severity and the scanner's own remediation text. The footer says which path produced the text.

Ranking without a model is deliberate, not a leftover. Open-source Checkov omits `severity` unless a commercial API key is set. `baselineRisk` trusts a scanner severity when one is present, and otherwise uses a small map of well-known check ids (public S3, `0.0.0.0/0`, privileged pods). Unknown ids stay at medium.

## Consequences

- Anthropic's native API, and any other non-compatible API, needs a new `LlmProvider`. The rest of the pipeline should not change.
- The model can raise or lower risk relative to the scanner. Only the top `max_explained` findings are eligible, so a buried medium finding will not be upgraded in v0.1.
- A failed model call does not fail the job. `fail_on` looks at the risk that was actually shown.
- The no-key comment is the same renderer as the model comment. Tests cover both.
