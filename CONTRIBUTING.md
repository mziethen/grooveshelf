# Contributing to GrooveShelf

Discuss substantial changes in a GitHub issue before implementation. Raspberry Pi 5 is the primary deployment target; keep frontend, API, persistence, metadata providers, and hardware integration separate.

## Development

Follow [local setup and isolated browser verification](docs/development.md). Python 3.12 and Node 24 are used in CI. Node is needed for browser tests, not for the deployed frontend.

Run backend tests from the repository root:

```sh
.venv/bin/pytest -q
```

Install browser dependencies with `npm ci --prefix frontend`, then install Chromium and run the browser suite against a disposable backend as described in the setup guide. Never run the integration suite against a personal collection.

## Pull requests

- Link the relevant issue in commits (`Refs #123`) and use `Closes #123` in the pull request when its acceptance criteria are met. Include a requirement ID when applicable.
- Update code and documentation together. Keep changes focused; avoid unrelated formatting or moves.
- Describe the user-visible result, relevant validation, and remaining limitations. CI runs backend and browser tests, ARM64/AMD64 builds, and a Compose persistence check.
- Preserve migration compatibility and protected manual metadata. Include migration tests for schema changes.
- Write documentation, issue titles, pull requests, and code-facing text in English.
- Do not commit access tokens, environment files, databases, cached covers, backups, or private collection details. Report reproducible issues with synthetic data.
