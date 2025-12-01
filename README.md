# ChessBeast

An AI-powered chess game annotator that produces human-friendly analysis. ChessBeast combines Stockfish engine analysis, Maia2 human-likeness prediction (NeurIPS 2024), and LLM-generated commentary to explain chess games like a coach would.

## Features

- **Human-Friendly Annotations**: Not just engine evaluations, but explanations of plans, ideas, and why moves are good or bad
- **Rating-Aware Analysis**: Adapts criticism and suggestions to any player skill level using Maia2's continuous ELO support
- **Critical Moment Detection**: Identifies key turning points, blunders, and missed opportunities
- **Opening Recognition**: ECO classification and reference to master games
- **Standards-Compliant Output**: Produces valid annotated PGN loadable in any chess GUI
- **Advanced Reasoning Models**: Supports OpenAI reasoning models (gpt-5, o1, o3) with configurable reasoning effort and real-time thought streaming

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

# Deep analysis with full commentary for a 1600-rated player
chessbeast analyze \
  --input game.pgn \
  --output annotated.pgn \
  --profile deep \
  --target-elo 1600

# Analyze from White's perspective (uses "we" and "they" language)
chessbeast analyze --input game.pgn --perspective white

# Analyze from Black's perspective
chessbeast analyze --input game.pgn --perspective black

# Limit LLM token usage for cost control
chessbeast analyze --input game.pgn --token-budget 30000

# Enable verbose mode to see LLM reasoning in real-time
chessbeast analyze --input game.pgn --verbose

# Enable debug mode for full LLM observability (FEN, eval, tool calls)
chessbeast analyze --input game.pgn --agentic --debug 2> debug.log

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
| `--perspective <side>` | Annotation perspective: `neutral`, `white`, `black` (default: neutral) |
| `--target-elo <rating>` | Target audience rating for explanations |
| `--model <model>` | OpenAI model to use (default: gpt-5-mini) |
| `--token-budget <tokens>` | Max tokens per game for LLM (default: 50000) |
| `--skip-maia` | Skip Maia human-likeness analysis |
| `--skip-llm` | Skip LLM annotations (use templates only) |
| `--reasoning-effort <level>` | LLM reasoning effort: `none`, `low`, `medium`, `high` (default: medium) |
| `--verbose` | Enable verbose mode with real-time LLM reasoning display |
| `--debug` | Enable debug mode with full LLM reasoning, move context, and tool call details |
| `--agentic` | Enable agentic mode with tool calling for critical moments |
| `--agentic-all` | Enable agentic mode for all moves (not just critical) |
| `--max-tool-calls <n>` | Max tool calls per position in agentic mode (default: 5) |
| `--show-costs` | Display LLM cost summary after analysis |
| `--agentic-exploration` | Enable agentic variation exploration |
| `--exploration-max-tool-calls <n>` | Max tool calls per variation exploration (default: 40) |
| `--exploration-max-depth <n>` | Max depth for variation exploration (default: 50) |
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

### Model Selection

Choose the OpenAI model based on your needs:

| Model | Input Cost | Output Cost | Best For |
|-------|------------|-------------|----------|
| `gpt-5-codex` | $1.25/1M | $10.00/1M | Deep analysis with reasoning |
| `gpt-5-mini` | $0.25/1M | $2.00/1M | Cost-effective quality analysis (default) |
| `gpt-5-nano` | $0.05/1M | $0.40/1M | Fast, budget-friendly annotations |

```bash
# Use default model (gpt-5-mini)
chessbeast analyze --input game.pgn

# Use budget-friendly nano model for quick analysis
chessbeast analyze --input game.pgn --model gpt-5-nano

# Use full codex model for deep reasoning
chessbeast analyze --input game.pgn --model gpt-5-codex --reasoning-effort high
```

### Verbosity Levels

| Level | Description |
|-------|-------------|
| `summary` | Game overview and key moments only |
| `normal` | Standard annotations with key lines (default) |
| `rich` | Detailed explanations with alternative variations |

### Perspective

Control whose point of view the annotations use:

| Perspective | Description | Example |
|-------------|-------------|---------|
| `neutral` | Objective third-person (default) | "White gains a tempo" |
| `white` | From White's point of view | "We gain a tempo" |
| `black` | From Black's point of view | "They gain a tempo" |

This is useful when analyzing your own games - set `--perspective white` if you played White to get personalized "we/they" commentary.

### Agentic Mode

Agentic mode enables the LLM to query external services using OpenAI function calling for deeper analysis:

```bash
# Enable agentic mode for critical moments
chessbeast analyze --input game.pgn --agentic

# Enable agentic mode for all moves (more thorough, higher cost)
chessbeast analyze --input game.pgn --agentic-all

# Limit tool calls per position
chessbeast analyze --input game.pgn --agentic --max-tool-calls 3

# Show cost summary after analysis
chessbeast analyze --input game.pgn --agentic --show-costs
```

**Available Tools:**

| Tool | Description |
|------|-------------|
| `evaluate_position` | Get Stockfish evaluation for a position |
| `predict_human_moves` | Get Maia predictions for human-likely moves |
| `lookup_opening` | Query ECO database for opening name |
| `find_reference_games` | Search Lichess Elite games database |
| `make_move` | Apply a move and get resulting position |

Agentic mode produces richer annotations by allowing the LLM to explore positions dynamically.

### Agentic Exploration Mode

Agentic exploration gives the LLM full control over variation exploration, allowing it to leave comments throughout variations (not just at the start/end) and decide which lines are worth pursuing:

```bash
# Enable agentic exploration for deep variation analysis
chessbeast analyze --input game.pgn --agentic-exploration

# Combine with standard agentic mode for comprehensive analysis
chessbeast analyze --input game.pgn --agentic --agentic-exploration

# Customize exploration limits
chessbeast analyze --input game.pgn --agentic-exploration \
  --exploration-max-tool-calls 60 --exploration-max-depth 40
```

**Exploration Tools:**

| Tool | Description |
|------|-------------|
| `get_board` | ASCII board visualization for the current position |
| `push_move` / `pop_move` | Navigate through positions |
| `start_branch` / `end_branch` | Manage variation branches |
| `add_comment` / `add_nag` | Annotate positions dynamically |
| `suggest_nag` | Get engine-based NAG suggestion for move quality |
| `get_eval_nag` | Get position evaluation NAG (+=, -+, etc.) |
| `assess_continuation` | Check if exploration should continue |

Agentic exploration uses intelligent caching for expensive Stockfish evaluations to avoid redundant analysis.

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
PGN Input → Parser → Engine + Maia2 → Critical Moments → Variation Explorer → LLM → Annotated PGN
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
