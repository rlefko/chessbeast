# ChessBeast

An AI-powered chess game annotator that produces human-friendly analysis. ChessBeast combines Stockfish engine analysis, Maia2 human-likeness prediction (NeurIPS 2024), and LLM-generated commentary to explain chess games like a coach would.

## Features

- **Human-Friendly Annotations**: Not just engine evaluations, but explanations of plans, ideas, and why moves are good or bad
- **Rating-Aware Analysis**: Adapts criticism and suggestions to any player skill level using Maia2's continuous ELO support
- **Critical Moment Detection**: Identifies key turning points, blunders, and missed opportunities
- **Opening Recognition**: ECO classification and reference to master games
- **Standards-Compliant Output**: Produces valid annotated PGN loadable in any chess GUI

## Installation

### Prerequisites

- Node.js 18+
- Python 3.12+
- Stockfish chess engine
- OpenAI API key

### Quick Start

```bash
# Clone the repository
git clone https://github.com/rlefko/chessbeast.git
cd chessbeast

# Run setup (installs dependencies, downloads models)
make setup

# Set your OpenAI API key
export OPENAI_API_KEY="your-key-here"

# Analyze a game
chessbeast analyze --input game.pgn --output annotated.pgn
```

## Usage

```bash
# Basic analysis (reads from stdin, writes to stdout)
chessbeast analyze < game.pgn > annotated.pgn

# With input/output files
chessbeast analyze --input game.pgn --output annotated.pgn

# Quick analysis for faster results
chessbeast analyze --input game.pgn --profile quick

# Deep analysis with rich commentary for a 1600-rated player
chessbeast analyze \
  --input game.pgn \
  --output annotated.pgn \
  --profile deep \
  --verbosity rich \
  --target-elo 1600

# Skip external services for offline analysis
chessbeast analyze --input game.pgn --skip-maia --skip-llm

# Validate setup before running
chessbeast analyze --dry-run

# Show resolved configuration
chessbeast analyze --show-config
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-i, --input <file>` | Input PGN file (default: stdin) |
| `-o, --output <file>` | Output file (default: stdout) |
| `-c, --config <file>` | Path to configuration file |
| `-p, --profile <profile>` | Analysis profile: `quick`, `standard`, `deep` (default: standard) |
| `-v, --verbosity <level>` | Output verbosity: `summary`, `normal`, `rich` (default: normal) |
| `--target-elo <rating>` | Target audience rating for explanations |
| `--skip-maia` | Skip Maia human-likeness analysis |
| `--skip-llm` | Skip LLM annotations (use templates only) |
| `--show-config` | Print resolved configuration and exit |
| `--no-color` | Disable colored output (useful for piping) |
| `--dry-run` | Validate setup and configuration without running analysis |
| `--version` | Display version |
| `--help` | Display help |

### Analysis Profiles

| Profile | Engine Depth | Critical Moments | MultiPV | Best For |
|---------|--------------|------------------|---------|----------|
| `quick` | 12/16 | ~15% of moves | 1 | Fast overview, blitz games |
| `standard` | 14/22 | ~25% of moves | 3 | Balanced analysis (default) |
| `deep` | 18/28 | ~35% of moves | 5 | Thorough study, tournament games |

### Verbosity Levels

| Level | Description |
|-------|-------------|
| `summary` | Game overview and key moments only |
| `normal` | Standard annotations with key lines (default) |
| `rich` | Detailed explanations with alternative variations |

### Configuration

ChessBeast supports configuration via files, environment variables, and CLI flags. See [docs/configuration.md](docs/configuration.md) for complete configuration options.

## Development

```bash
# Install dependencies
make install

# Run tests
make test

# Run linting
make lint

# Build
make build

# Start services (Stockfish, Maia)
make run
```

See [docs/](docs/) for detailed documentation.

## Architecture

ChessBeast uses a hybrid TypeScript + Python architecture:

- **TypeScript**: CLI, orchestration, PGN parsing/rendering
- **Python**: ML services (Stockfish wrapper, Maia2 model serving)
- **gRPC**: Inter-service communication

```
PGN Input → Parser → Engine + Maia2 → Critical Moments → LLM → Annotated PGN
```

### Maia2 Integration

ChessBeast uses [Maia2](https://github.com/CSSLab/maia2) (NeurIPS 2024), a unified neural network model for predicting human-like chess moves at any rating level. Unlike the original Maia which required 9 separate models for different rating bands (1100-1900), Maia2 uses a single model with continuous ELO support.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (see commit conventions below)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

Commits must be a single sentence with an emoji prefix and no ending punctuation:

```
✨ Add PGN parser for multi-game files
🐛 Fix castling rights validation
♻️ Refactor engine pool for better concurrency
📝 Update installation instructions
🧪 Add unit tests for move classification
```

## License

GPL-3.0 License - see [LICENSE](LICENSE) for details.
