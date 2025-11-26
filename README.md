# ChessBeast

An AI-powered chess game annotator that produces human-friendly analysis. ChessBeast combines Stockfish engine analysis, Maia human-likeness prediction, and LLM-generated commentary to explain chess games like a coach would.

## Features

- **Human-Friendly Annotations**: Not just engine evaluations, but explanations of plans, ideas, and why moves are good or bad
- **Rating-Aware Analysis**: Adapts criticism and suggestions to player skill level (1100-1900+ Elo)
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
# Basic analysis
chessbeast analyze --input game.pgn

# With options
chessbeast analyze \
  --input game.pgn \
  --output annotated.pgn \
  --profile standard \
  --verbosity rich \
  --target-elo 1600
```

### Analysis Profiles

| Profile | Description |
|---------|-------------|
| `quick` | Fast analysis, minimal commentary |
| `standard` | Balanced depth and speed (default) |
| `deep` | Thorough analysis, detailed commentary |

### Verbosity Levels

| Level | Description |
|-------|-------------|
| `summary` | Game overview and key moments only |
| `normal` | Standard annotations (default) |
| `rich` | Detailed explanations with sidelines |

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
- **Python**: ML services (Stockfish wrapper, Maia model serving)
- **gRPC**: Inter-service communication

```
PGN Input → Parser → Engine + Maia → Critical Moments → LLM → Annotated PGN
```

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

MIT License - see [LICENSE](LICENSE) for details.
