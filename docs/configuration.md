# Configuration

ChessBeast supports flexible configuration through files, environment variables, and CLI flags. Configuration sources are merged with the following precedence (highest to lowest):

1. **CLI arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**
4. **Default values** (lowest priority)

## Configuration File

ChessBeast uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) for configuration file discovery. The following file names are searched (in order):

- `package.json` (under `"chessbeast"` key)
- `.chessbeastrc`
- `.chessbeastrc.json`
- `.chessbeastrc.yaml`
- `.chessbeastrc.yml`
- `.chessbeastrc.js`
- `.chessbeastrc.cjs`
- `chessbeast.config.js`
- `chessbeast.config.cjs`

You can also specify a config file explicitly with the `--config` flag.

### Example Configuration Files

**JSON (`.chessbeastrc.json`)**:
```json
{
  "analysis": {
    "profile": "standard",
    "shallowDepth": 14,
    "deepDepth": 22,
    "multiPvCount": 3,
    "maxCriticalRatio": 0.25,
    "skipMaia": false,
    "skipLlm": false
  },
  "ratings": {
    "defaultRating": 1500,
    "targetAudienceRating": 1600
  },
  "llm": {
    "model": "gpt-5-codex",
    "temperature": 0.7,
    "timeout": 30000,
    "reasoningEffort": "medium",
    "streaming": true
  },
  "agentic": {
    "enabled": false,
    "annotateAll": false,
    "maxToolCalls": 5,
    "showCosts": true,
    "agenticExploration": false,
    "explorationMaxToolCalls": 40,
    "explorationMaxDepth": 50
  },
  "services": {
    "stockfish": {
      "host": "localhost",
      "port": 50051,
      "timeoutMs": 60000
    },
    "maia": {
      "host": "localhost",
      "port": 50052,
      "timeoutMs": 30000
    }
  },
  "databases": {
    "ecoPath": "data/eco.db",
    "lichessPath": "data/lichess_elite.db"
  },
  "output": {
    "verbosity": "normal",
    "includeVariations": true,
    "includeNags": true,
    "includeSummary": true
  }
}
```

**YAML (`.chessbeastrc.yaml`)**:
```yaml
analysis:
  profile: standard
  shallowDepth: 14
  deepDepth: 22
  multiPvCount: 3
  maxCriticalRatio: 0.25
  skipMaia: false
  skipLlm: false

ratings:
  defaultRating: 1500
  targetAudienceRating: 1600

llm:
  model: gpt-5-codex
  temperature: 0.7
  timeout: 30000
  reasoningEffort: medium
  streaming: true

agentic:
  enabled: false
  annotateAll: false
  maxToolCalls: 5
  showCosts: true
  agenticExploration: false
  explorationMaxToolCalls: 40
  explorationMaxDepth: 50

services:
  stockfish:
    host: localhost
    port: 50051
    timeoutMs: 60000
  maia:
    host: localhost
    port: 50052
    timeoutMs: 30000

databases:
  ecoPath: data/eco.db
  lichessPath: data/lichess_elite.db

output:
  verbosity: normal
  includeVariations: true
  includeNags: true
  includeSummary: true
```

## Configuration Schema

### Analysis Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `analysis.profile` | `"quick"` \| `"standard"` \| `"deep"` | `"standard"` | Analysis profile preset |
| `analysis.shallowDepth` | number | 14 | Engine depth for first pass (all positions) |
| `analysis.deepDepth` | number | 22 | Engine depth for second pass (critical moments) |
| `analysis.multiPvCount` | number | 3 | Number of principal variations to analyze |
| `analysis.maxCriticalRatio` | number | 0.25 | Maximum ratio of moves to mark as critical (0.0-1.0) |
| `analysis.skipMaia` | boolean | false | Skip Maia human-likeness analysis |
| `analysis.skipLlm` | boolean | false | Skip LLM annotation generation |

### Rating Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ratings.defaultRating` | number | 1500 | Default rating when player rating is unknown |
| `ratings.targetAudienceRating` | number | — | Target audience rating for explanations |

### LLM Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm.apiKey` | string | — | OpenAI API key (prefer `OPENAI_API_KEY` env var) |
| `llm.model` | string | `"gpt-5-codex"` | OpenAI model to use (see available models below) |
| `llm.temperature` | number | 0.7 | Model temperature (0.0-2.0) |
| `llm.timeout` | number | 30000 | Request timeout in milliseconds |
| `llm.reasoningEffort` | `"none"` \| `"low"` \| `"medium"` \| `"high"` | `"medium"` | Reasoning effort for codex models |
| `llm.streaming` | boolean | true | Enable streaming for real-time progress |

**Available Models:**
| Model | Input Cost | Output Cost | Best For |
|-------|------------|-------------|----------|
| `gpt-5-codex` | $1.25/1M | $10.00/1M | Deep analysis with reasoning (default) |
| `gpt-5` | $1.25/1M | $10.00/1M | Full GPT-5 capabilities |
| `gpt-5-mini` | $0.25/1M | $2.00/1M | Cost-effective quality analysis |
| `gpt-5-nano` | $0.05/1M | $0.40/1M | Fast, budget-friendly annotations |

**Reasoning Effort Levels:**
- `none`: Disable reasoning (standard completion, fastest)
- `low`: Minimal reasoning for faster responses
- `medium`: Balanced reasoning for quality analysis (default)
- `high`: Maximum reasoning for complex positions (slower, most thorough)

When using reasoning models (gpt-5-codex, o1, o3), the model's thinking process can be displayed in verbose mode (`--verbose` flag). This shows real-time reasoning as each move is analyzed.

### Debug Mode

Use `--debug` for detailed LLM observability beyond `--verbose`. Debug mode provides:

- **Move Context**: FEN, evaluation, best move, and classification for each analyzed position
- **Full LLM Reasoning**: Complete untruncated thinking (verbose shows truncated spinner text)
- **Tool Call Details**: Full request (name + JSON arguments) and response for agentic mode

Debug output goes to stderr for clean piping:

```bash
# Pipe PGN to stdout while capturing debug logs
chessbeast analyze --input game.pgn --agentic --debug > annotated.pgn 2> debug.log

# Or view debug output live while saving PGN
chessbeast analyze --input game.pgn --debug 2>&1 | tee analysis.log
```

**Example Debug Output:**

```
=== DEBUG: 14... Be6 ===
FEN: r2q1rk1/pp2bppp/2n1bn2/3pp3/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 b - - 0 14
Eval: +0.45 | Best: Nxd4
Classification: inaccuracy (35cp loss)

--- LLM Reasoning ---
Let me analyze this position. Black played Be6 developing the bishop...
--- End Reasoning ---

[Tool Call 1/5] evaluate_position
Arguments:
{
  "fen": "r2q1rk1/pp2bppp/2n1bn2/3pp3/...",
  "depth": 20
}

[Tool Result] evaluate_position (156ms)
{
  "evaluation": 45,
  "bestMove": "Nxd4"
}
```

Note: `--debug` implies `--verbose` (debug is a superset of verbose mode).

### Agentic Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentic.enabled` | boolean | false | Enable agentic mode with tool calling |
| `agentic.annotateAll` | boolean | false | Annotate all moves (not just critical moments) |
| `agentic.maxToolCalls` | number | 5 | Maximum tool calls per position |
| `agentic.showCosts` | boolean | true | Display LLM cost summary after analysis |
| `agentic.agenticExploration` | boolean | false | Enable agentic variation exploration |
| `agentic.explorationMaxToolCalls` | number | 40 | Maximum tool calls per variation exploration |
| `agentic.explorationMaxDepth` | number | 50 | Maximum depth (half-moves) for variation exploration |

**Agentic Mode:**
When enabled, the LLM can query external services using OpenAI function calling:
- `evaluate_position`: Get Stockfish evaluation
- `predict_human_moves`: Get Maia predictions for human-likely moves
- `lookup_opening`: Query ECO database
- `find_reference_games`: Search Lichess Elite games
- `make_move`: Apply a move and get resulting position

**Agentic Exploration Mode:**
When `agenticExploration` is enabled, variation exploration becomes fully agentic. The LLM has complete control over which lines to explore and can leave comments throughout variations (not just at the start/end). Available exploration tools:

- `get_board`: Visual ASCII board representation for the current position
- `push_move`: Play a move and advance the position
- `pop_move`: Take back a move
- `start_branch`: Begin a new variation branch
- `end_branch`: Close the current variation
- `add_comment`: Add a comment at the current position
- `add_nag`: Add a NAG (Numeric Annotation Glyph) to the current move
- `suggest_nag`: Get engine-based NAG suggestion for a move (compares to best move)
- `get_eval_nag`: Get position evaluation NAG (+=, -+, etc.)
- `assess_continuation`: Check if exploration should continue (tactical tension, eval swings)
- `finish_exploration`: Complete exploration and return results

The explorer uses intelligent caching for expensive Stockfish evaluations (depth ≥ 14) to avoid redundant analysis. Stopping heuristics combine tactical tension detection, evaluation swings, and budget awareness to balance thoroughness with efficiency.

### Service Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `services.stockfish.host` | string | `"localhost"` | Stockfish service host |
| `services.stockfish.port` | number | 50051 | Stockfish service port |
| `services.stockfish.timeoutMs` | number | 60000 | Stockfish request timeout |
| `services.maia.host` | string | `"localhost"` | Maia service host |
| `services.maia.port` | number | 50052 | Maia service port |
| `services.maia.timeoutMs` | number | 30000 | Maia request timeout |

### Database Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `databases.ecoPath` | string | `"data/eco.db"` | Path to ECO opening database |
| `databases.lichessPath` | string | `"data/lichess_elite.db"` | Path to Lichess Elite games database |

### Output Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output.verbosity` | `"ultra-brief"` \| `"brief"` \| `"normal"` \| `"detailed"` | `"normal"` | Annotation verbosity level |
| `output.includeVariations` | boolean | true | Include alternative variations in output |
| `output.includeNags` | boolean | true | Include NAG symbols ($1, $2, etc.) |
| `output.includeSummary` | boolean | true | Include game summary comment |

**Verbosity Levels:**
- `ultra-brief`: 5-8 words max for critical positions, 5 for non-critical (useful for tight token budgets)
- `brief`: 10-15 words max for critical positions, 10 for non-critical
- `normal`: 15-25 words max for critical positions, 10 for non-critical
- `detailed`: 25-40 words max for critical positions, 15 for non-critical

## Environment Variables

All configuration options can be set via environment variables:

### API Keys
| Variable | Config Path |
|----------|-------------|
| `OPENAI_API_KEY` | `llm.apiKey` |

### Analysis
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_PROFILE` | `analysis.profile` |
| `CHESSBEAST_SKIP_MAIA` | `analysis.skipMaia` |
| `CHESSBEAST_SKIP_LLM` | `analysis.skipLlm` |

### Ratings
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_DEFAULT_RATING` | `ratings.defaultRating` |
| `CHESSBEAST_TARGET_RATING` | `ratings.targetAudienceRating` |

### LLM
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_LLM_MODEL` | `llm.model` |
| `CHESSBEAST_LLM_TIMEOUT` | `llm.timeout` |
| `CHESSBEAST_TOKEN_BUDGET` | `llm.tokenBudget` |
| `LLM_REASONING_EFFORT` | `llm.reasoningEffort` |
| `LLM_STREAMING` | `llm.streaming` |

### Agentic
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_AGENTIC` | `agentic.enabled` |
| `CHESSBEAST_AGENTIC_ALL` | `agentic.annotateAll` |
| `CHESSBEAST_MAX_TOOL_CALLS` | `agentic.maxToolCalls` |
| `CHESSBEAST_SHOW_COSTS` | `agentic.showCosts` |

### Services
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_STOCKFISH_HOST` | `services.stockfish.host` |
| `CHESSBEAST_STOCKFISH_PORT` | `services.stockfish.port` |
| `CHESSBEAST_MAIA_HOST` | `services.maia.host` |
| `CHESSBEAST_MAIA_PORT` | `services.maia.port` |

### Databases
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_ECO_DB` | `databases.ecoPath` |
| `CHESSBEAST_LICHESS_DB` | `databases.lichessPath` |

### Output
| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_VERBOSITY` | `output.verbosity` |

## Profile Presets

Profiles provide preset configurations for common use cases:

### Quick Profile
```json
{
  "shallowDepth": 12,
  "deepDepth": 16,
  "multiPvCount": 1,
  "maxCriticalRatio": 0.15
}
```

### Standard Profile (Default)
```json
{
  "shallowDepth": 14,
  "deepDepth": 22,
  "multiPvCount": 3,
  "maxCriticalRatio": 0.25
}
```

### Deep Profile
```json
{
  "shallowDepth": 18,
  "deepDepth": 28,
  "multiPvCount": 5,
  "maxCriticalRatio": 0.35
}
```

## Viewing Resolved Configuration

Use `--show-config` to see the final merged configuration:

```bash
chessbeast analyze --show-config
```

This displays the configuration after merging all sources (defaults, file, env vars, CLI args).
