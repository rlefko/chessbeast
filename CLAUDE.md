# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChessBeast is an AI chess annotator that takes PGN input and produces human-friendly annotated PGN output. It combines Stockfish (engine analysis), Maia Chess (human-likeness prediction), LLMs (natural language commentary), and game databases (opening theory).

**Repository**: github.com/rlefko/chessbeast (MIT License)

## Architecture

**Hybrid TypeScript + Python monorepo:**
- `packages/` - TypeScript packages (CLI, core logic, PGN handling, gRPC clients)
- `services/` - Python gRPC services (Stockfish wrapper, Maia model serving)
- `data/` - SQLite databases (ECO openings, Lichess Elite games)

**Data flow:**
```
PGN → Parser → Positions → Engine + Maia + DB → Critical Moments → Annotation Plan → LLM → Annotated PGN
```

**Inter-service communication**: gRPC with Protobuf (definitions in `services/protos/`)

## Build & Development Commands

```bash
# Setup
make setup              # Full setup (install deps, download models, setup DB)
make install            # Install all dependencies (npm + pip)

# Build
make build              # Build all packages
make build-ts           # Build TypeScript only
make build-protos       # Generate gRPC stubs from protos

# Test
make test               # Run all tests
make test-ts            # TypeScript tests (Vitest)
make test-py            # Python tests (pytest)
pnpm vitest run parser  # Run specific TS test file by pattern

# Run
make run                # Start all services
make run-stockfish      # Start Stockfish service only
make run-maia           # Start Maia service only
chessbeast analyze --input game.pgn --output annotated.pgn

# Lint
make lint               # Lint all code
make lint-fix           # Auto-fix lint issues

# Docker
make docker-build       # Build Docker images
make docker-up          # Start services via docker-compose
make docker-down        # Stop services
```

## Python Environment

Python 3.12 via virtual environment:
```bash
source .venv/bin/activate
python -m pytest services/stockfish/tests/test_engine.py -v  # Single test file
python -m pytest -k "test_uci"  # Tests matching pattern
```

## Git Conventions

- **All changes via Pull Requests** - no direct commits to main
- **Commit format**: Single sentence, emoji prefix, no ending punctuation
  - Examples: `✨ Add PGN parser for multi-game files`, `🐛 Fix castling rights validation`, `♻️ Refactor engine pool for better concurrency`
- **Author**: Ryan Lefkowitz (ryan@avoca.ai) - do not credit Claude/AI
- Pre-commit hooks enforce commit message format

Common emoji prefixes:
- ✨ New feature
- 🐛 Bug fix
- ♻️ Refactor
- 📝 Documentation
- 🧪 Tests
- 🔧 Configuration
- ⬆️ Dependencies

## Key Technical Details

**Move classification thresholds** are rating-dependent (see `packages/core/src/classifier/`):
- 1200 Elo: inaccuracy 50-149cp, mistake 150-299cp, blunder ≥300cp
- 2000 Elo: inaccuracy 30-89cp, mistake 90-179cp, blunder ≥180cp

**Two-pass analysis**:
- Pass 1 (shallow): depth 12-16 for all positions
- Pass 2 (deep): depth 20-24, multipv=3 for critical moments only

**Critical moment detection** caps at ~25% of moves, ranked by "interestingness score"

**Maia models**: Rating bands 1100-1900 (100-point increments), loaded on demand

## Testing Requirements

- Unit tests mock all external dependencies (Stockfish, Maia, OpenAI)
- Tests run as CI check on every PR
- Use pytest fixtures for Python, Jest mocks for TypeScript

## Documentation

All documentation in `docs/` folder, written in Markdown.
