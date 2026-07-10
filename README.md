# ChessBeast

An AI-powered chess game annotator that produces human-friendly analysis. ChessBeast combines Stockfish engine analysis, Maia2 human-likeness prediction (NeurIPS 2024), and LLM-generated commentary to explain chess games like a coach would.

## Quick Start

Prerequisites: Node.js 18+, Python 3.12, pnpm, uv, and an OpenAI API key.

```bash
# Clone and set up (installs deps and hooks, generates protos, builds databases, builds Stockfish from source)
git clone https://github.com/rlefko/chessbeast.git
cd chessbeast
make setup

# Provide your OpenAI API key
export OPENAI_API_KEY="your-key-here"

# Start the engine and model services, then annotate a game
make run
chessbeast analyze --input game.pgn --output annotated.pgn
```

More ways to run it:

```bash
# Annotate from White's point of view (we/they language)
chessbeast analyze --input game.pgn --perspective white

# Simpler explanations with more frequent comments
chessbeast analyze --input game.pgn --audience beginner --comment-density verbose

# Use the budget-friendly model
chessbeast analyze --input game.pgn --model gpt-5-nano

# Thorough analysis (deeper search, full themes)
chessbeast analyze --input game.pgn --speed deep

# Watch analysis live in a terminal debug UI
chessbeast analyze --input game.pgn --debug-gui
```

See [docs/configuration.md](docs/configuration.md) for the full flag, profile, and model reference.

## Project Structure

```
packages/
  cli/          Entry point: analyze command, config, orchestrator, engine adapters
  core/         Analysis pipeline, critical moments, priority-queue exploration, variation DAG
  llm/          Engine-driven explorer, themes, narrator, game summary, OpenAI client, pricing
  pgn/          PGN parsing and rendering, ChessPosition notation boundary, DAG transformer
  grpc-client/  Typed clients for the Python services
  database/     ECO and Lichess Elite SQLite clients and loaders
  debug-gui/    WebSocket debug server plus terminal client
  test-utils/   Shared fixtures and mocks
services/
  stockfish/    Stockfish engine pool for evaluation and MultiPV (:50051)
  stockfish16/  Stockfish 16 classical evaluation breakdown (:50053)
  maia/         Maia2 human-move prediction and rating estimation (:50052)
  common/       Shared exceptions, gRPC helpers, GracefulServer (no port)
  protos/       Protobuf definitions
```

## Tech Stack

| Area | Choice |
|------|--------|
| TypeScript packages | TypeScript, Node.js 18+, pnpm, Turborepo |
| Python services | Python 3.12, uv |
| Inter-service transport | gRPC with Protobuf |
| Opening and reference data | SQLite (ECO, Lichess Elite) |
| Engine ground truth | Stockfish (built from source) plus SF16 classical eval |
| Human-move prediction | Maia2 (NeurIPS 2024) |
| Coaching voice | OpenAI |

## Development Commands

| Command | Purpose |
|---------|---------|
| `make setup` | Full setup: deps, hooks, protos, databases, Stockfish source build |
| `make build` | Build protos and all TypeScript packages |
| `make build-protos` | Regenerate gRPC stubs from `services/protos/` |
| `make run` / `make stop` | Start or stop services (native Stockfish, Docker Maia) |
| `make test` | All unit tests (Vitest + pytest) |
| `make lint` / `make lint-fix` | Lint (ESLint, Prettier, ruff, mypy) or auto-fix |
| `make typecheck` | TypeScript and mypy type checks |
| `make rebuild` | Force rebuild (clears build caches, keeps node_modules) |

See [CLAUDE.md](CLAUDE.md) for the complete command list and CI checklist.

## Troubleshooting

- **Analysis cannot reach a service**: start the engine and model services with `make run`; stop them with `make stop`.
- **Stale or missing gRPC stubs**: regenerate them with `make build-protos`.
- **Stockfish build failures**: force a rebuild from the latest master with `make docker-rebuild-stockfish` (build hardening landed in PRs #75 and #88).
- **Clean rebuild without reinstalling dependencies**: run `make rebuild`, which clears build caches but preserves `node_modules` (PR #70).
- **Garbled output when piping**: add `--no-color` to disable ANSI colors.

## How It Works

ChessBeast runs a two-pass engine analysis: a shallow pass over every position, then a deeper MultiPV pass on the critical moments detected by win-probability drop. It then explores those moments with an engine-driven priority queue that scores lines, detects tactical, positional, structural, and dynamic themes, and records everything in a transposition-aware variation DAG. Only after the engine finishes does the LLM narrate, turning the collected comment intents into coach-quality prose and a game summary. No LLM call ever blocks the search. For the vocabulary see [docs/concepts.md](docs/concepts.md); for the structure and data flow see [docs/architecture.md](docs/architecture.md).

## Documentation

- [docs/concepts.md](docs/concepts.md): shared vocabulary, tiers, and scores.
- [docs/architecture.md](docs/architecture.md): packages, services, data flow, and service APIs.
- [docs/analysis-conventions.md](docs/analysis-conventions.md): chess-correctness rules (notation, plies, eval semantics).
- [docs/annotation-conventions.md](docs/annotation-conventions.md): how the output reads (voice, budgets, density, honesty).
- [docs/performance-conventions.md](docs/performance-conventions.md): speed and budget rules.
- [docs/configuration.md](docs/configuration.md): config schema, environment variables, and CLI reference.
- [docs/docker.md](docs/docker.md): deployment.
- [docs/archive/](docs/archive/): superseded design documents kept for provenance.

## Maia2

ChessBeast uses [Maia2](https://github.com/CSSLab/maia2) (NeurIPS 2024), a unified neural network that predicts human-like chess moves at any rating level. Unlike the original Maia, which required nine separate models for rating bands 1100 to 1900, Maia2 uses a single model with continuous ELO support.

## Contributing

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GPL-3.0. See [LICENSE](LICENSE) for details.

## Author

Ryan Lefkowitz (rlefkowitz1800@yahoo.com)
