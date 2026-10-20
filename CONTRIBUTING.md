# Contributing

Thanks for looking at this. The useful contribution is a small, tested change to parsing, ranking, redaction, or the comment. A new scanner or a new model provider should sit behind the existing interface.

## Setup

Node.js 20 or newer.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

`npm test` includes an integration test that runs Checkov and Trivy when both are on `PATH`. Without them, that test is skipped and the unit tests still run. CI installs Checkov 3.3.29 and Trivy 0.76.0 so the integration test runs there.

The GitHub Action loads `dist/index.js`. After you change `src/`, run `npm run build` and commit the bundle with the source. CI fails if `dist/` does not match the build.

## Tests

Unit tests live next to the code and use Vitest. The model is a `LlmProvider` fake. Scanner JSON fixtures live in `src/scanners/fixtures/`. Do not put a real secret in a fixture or in `examples/`. The `AKIAIOSFODNN7EXAMPLE` string in the sample bucket is Amazon's published example key and is there so redaction tests have something to catch.

When you add a check id to the no-key ranking map, add a unit test that says what happens when the scanner also supplies a severity. Scanner severity wins.

## Pull requests

- Describe the behavior a reviewer can see, not only the files you touched.
- Keep the no-key path working. A change that requires an API key to post a comment is a regression.
- Do not log snippets, request bodies, or tokens.
- If the change contradicts an ADR, update the ADR or add a new one instead of quietly drifting.

## Conduct

`CODE_OF_CONDUCT.md` applies to issues, pull requests, and discussions.
