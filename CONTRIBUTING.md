# Contributing to ChessBeast

Thanks for your interest in ChessBeast. This guide covers setup, style, tests, and how changes land.

## Prerequisites and Setup

You need Node.js 18+, Python 3.12, pnpm, and uv. Then run the full setup, which installs dependencies, installs the git hooks, generates the gRPC stubs, builds the SQLite databases, and builds Stockfish from source:

```bash
git clone https://github.com/rlefko/chessbeast.git
cd chessbeast
make setup
```

See [README.md](README.md) for a quick tour and [docs/architecture.md](docs/architecture.md) for how the packages and services fit together.

## Code Style

TypeScript is checked with ESLint and formatted with Prettier, and every package compiles under strict TypeScript (`strict: true`). Python is linted with ruff and type-checked with mypy in strict mode (`strict = true`). Run the checks before you commit:

```bash
make lint        # ESLint, Prettier, ruff, mypy
make lint-fix    # auto-fix what can be fixed
make typecheck   # tsc and mypy
```

## Tests

Behavior changes come with tests. Run the full suite before opening a pull request:

```bash
make test        # Vitest (TypeScript) and pytest (Python)
```

Coverage gates are enforced and will fail the build: each TypeScript package has its own Vitest v8 thresholds (see `packages/core/vitest.config.ts` and the llm, pgn, and debug-gui configs), and Python enforces `fail_under = 78` in `pyproject.toml`. Mock external dependencies (Stockfish, Maia, OpenAI) in unit tests and reuse the fixtures in `packages/test-utils/`.

## Commit Convention

Every commit message is a single sentence with an emoji prefix and no ending punctuation, enforced by `scripts/hooks/commit-msg` (installed by `make setup`). See [CLAUDE.md](CLAUDE.md) for the full list of emoji prefixes.

```
✨ Add PGN parser for multi-game files
```

## Pull Request Process

All changes land via a pull request to `main`; there are no direct commits. Keep each PR focused, and update the affected docs in the same PR as any behavior change. Continuous integration mirrors the local checks and must pass:

```bash
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run build
pnpm run test

uv run ruff check services/
uv run ruff format --check services/
uv run mypy services/
uv run pytest --cov --cov-report=term
```

## License

By contributing, you agree that your contributions are licensed under the project's GPL-3.0 license.
