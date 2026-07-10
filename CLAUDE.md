# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## Project Overview

ChessBeast is an AI chess annotator: PGN in, coach-quality annotated PGN out. It combines Stockfish for ground truth, Maia2 for human-likeness prediction, an LLM for the coaching voice, and SQLite databases for opening theory. Licensed GPL-3.0. Shared vocabulary lives in [docs/concepts.md](docs/concepts.md); system structure lives in [docs/architecture.md](docs/architecture.md).

## Architecture at a Glance

Data flow: PGN -> parse -> two-pass engine analysis (`AnalysisPipeline`) -> win-probability critical moments -> engine-driven exploration (priority queue, variation DAG, theme detection) -> comment intents -> post-write narration -> annotated PGN. Ultra-Fast Coach is the only annotation pipeline; the `--ultra-fast-coach` flag is a deprecated no-op.

- `packages/cli`: entry point, config loading, orchestrator
- `packages/core`: analysis pipeline, move classifier, exploration, storage
- `packages/llm`: engine-driven explorer, narration, post-write pipeline, cost tracking
- `packages/pgn`: PGN parsing/rendering and chess position logic
- `packages/database`: ECO and Lichess Elite SQLite clients
- `packages/grpc-client`: typed clients for the Python services
- `packages/debug-gui`: terminal debug UI for live analysis
- `packages/test-utils`: shared fixtures and mocks
- `services/`: Python gRPC services: `stockfish` (:50051), `stockfish16` (:50053, classical eval), `maia` (:50052), plus `common` (shared exceptions, gRPC helpers, `GracefulServer`) and `protos`

The engine adapter (packages/cli/src/orchestrator/adapters.ts) is the UCI/SAN boundary; see docs/analysis-conventions.md.

## Development Commands

| Command | Purpose |
| --- | --- |
| `make setup` | Full setup: deps, hooks, protos, databases, Stockfish source build |
| `make build` | Build protos and all TypeScript packages |
| `make build-protos` | Regenerate gRPC stubs from `services/protos/` |
| `make test` | All unit tests (Vitest + pytest) |
| `make test-ts` / `make test-py` | TypeScript or Python unit tests only |
| `make test-integration` | CLI integration tests |
| `make test-golden` | Golden output tests |
| `make test-quality` | Annotation quality validation suite |
| `make test-benchmark` | Performance benchmarks |
| `make lint` / `make lint-fix` | Lint (ESLint, Prettier, ruff, mypy) / auto-fix |
| `make typecheck` | TypeScript and mypy type checks |
| `make run` / `make stop` | Start/stop services (native Stockfish, Docker Maia) |

Single tests: `pnpm vitest run <pattern>` for TypeScript, `uv run pytest <path>` for Python.

## Python Environment

Python 3.12 managed by uv (`uv sync --all-packages` under `make install`). Either `source .venv/bin/activate` or prefix commands with `uv run`.

## Git Workflow

- All changes land via pull request to `main`; no direct commits.
- Commit format: emoji prefix plus a single sentence with no ending punctuation, enforced by `scripts/hooks/commit-msg` (installed by `make setup`).
- Author: rlefko only, no AI authorship of any kind.

Common emoji prefixes:

- ✨ New feature
- 🐛 Bug fix
- ♻️ Refactor
- 📝 Documentation
- 🧪 Tests
- 🔧 Configuration
- ⬆️ Dependencies

## Code Review Before Commits

Run these checks on your diff before every commit:

1. Reuse subagent: hunt for existing helpers, types, and fixtures the change should use instead of new code.
2. Simplification subagent: remove needless indirection, dead branches, and speculative generality.
3. Readability subagent: naming, comment quality, and control flow a maintainer can follow cold.
4. Chess-correctness check: the analysis-review skill runs this check end to end.
5. Annotation-voice check: the annotation-review skill runs this check end to end.
6. Performance check: the perf-review skill runs this check end to end.
7. Apply the findings before committing; do not defer them to a follow-up.

## Documentation

Ownership map, so every fact has exactly one home:

- [docs/concepts.md](docs/concepts.md) owns vocabulary: terms, tiers, scores, and their definitions.
- [docs/architecture.md](docs/architecture.md) owns structure: packages, services, data flow, service APIs.
- [docs/analysis-conventions.md](docs/analysis-conventions.md), [docs/annotation-conventions.md](docs/annotation-conventions.md), and [docs/performance-conventions.md](docs/performance-conventions.md) own the rules; they are the sources of truth the review skills check against.
- [docs/configuration.md](docs/configuration.md) owns the config schema and CLI reference.
- [docs/docker.md](docs/docker.md) owns deployment.

Write American English. Never use an em dash; use commas, periods, colons, or parentheses. Update the affected docs in the same PR as any behavior change.

## CI Checklist

Mirror of `.github/workflows/ci.yml`; run locally before pushing:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run build
pnpm run test

uv sync --all-packages
uv run ruff check services/
uv run ruff format --check services/
uv run mypy services/
uv run pytest --cov --cov-report=term
```

Coverage gates fail the build: per-package Vitest v8 thresholds (see `packages/core/vitest.config.ts` and the llm, pgn, and debug-gui configs) and pytest `fail_under = 78` in `pyproject.toml`.
