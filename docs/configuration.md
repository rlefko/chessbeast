# Configuration

ChessBeast supports flexible configuration through files, environment variables, and CLI flags. Configuration sources are merged with the following precedence (highest to lowest):

1. **CLI arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**
4. **Default values** (lowest priority)

The schema lives in `packages/cli/src/config/schema.ts`, defaults in `packages/cli/src/config/defaults.ts`, and the merge logic in `packages/cli/src/config/loader.ts`. This document tracks those files.

## Configuration File

ChessBeast uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) for configuration file discovery. The following file names are searched, in order:

- `package.json` (under a `"chessbeast"` key)
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
    "model": "gpt-5-mini",
    "temperature": 0.7,
    "timeout": 30000,
    "reasoningEffort": "medium",
    "streaming": true
  },
  "services": {
    "stockfish": { "host": "localhost", "port": 50051, "timeoutMs": 300000 },
    "maia": { "host": "localhost", "port": 50052, "timeoutMs": 30000 }
  },
  "databases": {
    "ecoPath": "data/eco.db",
    "lichessPath": "data/lichess_elite.db"
  },
  "output": {
    "includeVariations": true,
    "includeNags": true,
    "includeSummary": true,
    "perspective": "neutral"
  },
  "ultraFastCoach": {
    "speed": "normal",
    "themes": "important",
    "variations": "medium",
    "commentDensity": "normal",
    "audience": "club"
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
  model: gpt-5-mini
  temperature: 0.7
  timeout: 30000
  reasoningEffort: medium
  streaming: true

services:
  stockfish:
    host: localhost
    port: 50051
    timeoutMs: 300000
  maia:
    host: localhost
    port: 50052
    timeoutMs: 30000

databases:
  ecoPath: data/eco.db
  lichessPath: data/lichess_elite.db

output:
  includeVariations: true
  includeNags: true
  includeSummary: true
  perspective: neutral

ultraFastCoach:
  speed: normal
  themes: important
  variations: medium
  commentDensity: normal
  audience: club
```

## Configuration Schema

### Analysis Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `analysis.profile` | `"quick"` \| `"standard"` \| `"deep"` | `"standard"` | Analysis profile preset |
| `analysis.shallowDepth` | number (1-99) | 14 | Engine depth for the shallow pass (all positions) |
| `analysis.shallowTimeLimitMs` | number | 3000 | Time limit per position for the shallow pass |
| `analysis.deepDepth` | number (1-99) | 22 | Engine depth for the deep pass (critical moments) |
| `analysis.deepTimeLimitMs` | number | 10000 | Time limit per position for the deep pass |
| `analysis.multiPvCount` | number (1-10) | 3 | Number of principal variations for critical moments |
| `analysis.maxCriticalRatio` | number (0.0-1.0) | 0.25 | Maximum ratio of moves marked critical |
| `analysis.mateMinTimeMs` | number (optional) | 5000 | Minimum search time for mate or winning positions |
| `analysis.skipMaia` | boolean | false | Skip Maia human-likeness analysis |
| `analysis.skipLlm` | boolean | false | Skip LLM annotation generation (template only) |

`deepDepth` must be greater than or equal to `shallowDepth`.

### Rating Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ratings.defaultRating` | number (100-4000) | 1500 | Default rating when a player rating is unknown |
| `ratings.targetAudienceRating` | number (100-4000, optional) | (none) | Target audience rating for explanations |

### LLM Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm.apiKey` | string (optional) | (none) | OpenAI API key (prefer the `OPENAI_API_KEY` env var) |
| `llm.model` | string | `"gpt-5-mini"` | OpenAI model (see [Models](#models)) |
| `llm.temperature` | number (0.0-2.0) | 0.7 | Sampling temperature |
| `llm.timeout` | number (1000-300000) | 30000 | Request timeout in milliseconds |
| `llm.tokenBudget` | number (optional) | 50000 | Maximum tokens per game |
| `llm.reasoningEffort` | `"none"` \| `"low"` \| `"medium"` \| `"high"` | `"medium"` | Reasoning effort for reasoning models |
| `llm.streaming` | boolean | true | Stream reasoning for real-time display |

### Service Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `services.stockfish.host` | string | `"localhost"` | Stockfish service host |
| `services.stockfish.port` | number | 50051 | Stockfish service port |
| `services.stockfish.timeoutMs` | number | 300000 | Stockfish request timeout |
| `services.maia.host` | string | `"localhost"` | Maia service host |
| `services.maia.port` | number | 50052 | Maia service port |
| `services.maia.timeoutMs` | number | 30000 | Maia request timeout |
| `services.stockfish16` | object (optional) | (none) | Optional Stockfish 16 classical-eval endpoint |

`services.stockfish16` is optional. When present, it takes `host`, `port` (the service listens on 50053), `timeoutMs`, and an `enabled` flag.

### Database Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `databases.ecoPath` | string | `"data/eco.db"` | Path to the ECO opening database |
| `databases.lichessPath` | string | `"data/lichess_elite.db"` | Path to the Lichess Elite games database |

### Output Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output.includeVariations` | boolean | true | Include alternative variations in the output PGN |
| `output.includeNags` | boolean | true | Include NAG symbols (`$1`, `$2`, and so on) |
| `output.includeSummary` | boolean | true | Include the game summary comment |
| `output.perspective` | `"neutral"` \| `"white"` \| `"black"` | `"neutral"` | Annotation perspective |

### Ultra-Fast Coach Settings

Ultra-Fast Coach is the only annotation pipeline; these keys tune it.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ultraFastCoach.speed` | `"fast"` \| `"normal"` \| `"deep"` | `"normal"` | Analysis speed tier (see [Speed Tiers](#speed-tiers)) |
| `ultraFastCoach.themes` | `"none"` \| `"important"` \| `"all"` | `"important"` | Theme output verbosity |
| `ultraFastCoach.variations` | `"low"` \| `"medium"` \| `"high"` | `"medium"` | Variation exploration depth |
| `ultraFastCoach.commentDensity` | `"sparse"` \| `"normal"` \| `"verbose"` | `"normal"` | Comment density |
| `ultraFastCoach.audience` | `"beginner"` \| `"club"` \| `"expert"` | `"club"` | Target audience level |

## Environment Variables

Set any of these to override the corresponding config key.

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

### Output and Ultra-Fast Coach

| Variable | Config Path |
|----------|-------------|
| `CHESSBEAST_PERSPECTIVE` | `output.perspective` |
| `CHESSBEAST_SPEED` | `ultraFastCoach.speed` |
| `CHESSBEAST_THEMES` | `ultraFastCoach.themes` |
| `CHESSBEAST_VARIATIONS` | `ultraFastCoach.variations` |
| `CHESSBEAST_COMMENT_DENSITY` | `ultraFastCoach.commentDensity` |
| `CHESSBEAST_AUDIENCE` | `ultraFastCoach.audience` |

## Profile Presets

Setting `analysis.profile` (or `--profile`) applies a preset over the analysis pass settings:

### Quick

```json
{
  "shallowDepth": 12,
  "shallowTimeLimitMs": 2000,
  "deepDepth": 16,
  "deepTimeLimitMs": 5000,
  "multiPvCount": 1,
  "maxCriticalRatio": 0.15,
  "mateMinTimeMs": 2000
}
```

### Standard (default)

```json
{
  "shallowDepth": 14,
  "shallowTimeLimitMs": 3000,
  "deepDepth": 22,
  "deepTimeLimitMs": 10000,
  "multiPvCount": 3,
  "maxCriticalRatio": 0.25,
  "mateMinTimeMs": 5000
}
```

### Deep

```json
{
  "shallowDepth": 18,
  "shallowTimeLimitMs": 5000,
  "deepDepth": 28,
  "deepTimeLimitMs": 20000,
  "multiPvCount": 5,
  "maxCriticalRatio": 0.35,
  "mateMinTimeMs": 10000
}
```

## CLI Reference

All flags below belong to the `chessbeast analyze` command.

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --input <file>` | Input PGN file | stdin |
| `-o, --output <file>` | Output file | stdout |
| `-c, --config <file>` | Path to a config file | auto-discovered |
| `-p, --profile <profile>` | Analysis profile: `quick`, `standard`, `deep` | `standard` |
| `--perspective <side>` | Annotation perspective: `neutral`, `white`, `black` | `neutral` |
| `--target-elo <rating>` | Target audience rating for annotations | player rating, else 1500 |
| `--model <model>` | OpenAI model to use | `gpt-5-mini` |
| `--token-budget <tokens>` | Maximum tokens per game for the LLM | 50000 |
| `--skip-maia` | Skip Maia human-likeness analysis | off |
| `--skip-llm` | Skip LLM annotations (template only) | off |
| `--reasoning-effort <level>` | Reasoning effort: `none`, `low`, `medium`, `high` | `medium` |
| `--verbose` | Show real-time LLM reasoning | off |
| `--debug` | Detailed debug output to stderr (implies `--verbose`) | off |
| `--speed <level>` | Analysis speed tier: `fast`, `normal`, `deep` | `normal` |
| `--themes <level>` | Theme verbosity: `none`, `important`, `all` | `important` |
| `--variations <level>` | Variation depth: `low`, `medium`, `high` | `medium` |
| `--comment-density <level>` | Comment density: `sparse`, `normal`, `verbose` | `normal` |
| `--audience <level>` | Audience level: `beginner`, `club`, `expert` | `club` |
| `--debug-gui [port]` | Start the Debug GUI WebSocket server | port 9222 |
| `--ultra-fast-coach` | Deprecated no-op; Ultra-Fast Coach is the default | (removed in a future release) |
| `--show-config` | Print the resolved configuration and exit | |
| `--no-color` | Disable colored output (useful for piping) | |
| `--dry-run` | Validate setup and configuration without running | |
| `--version` | Print the version | |
| `--help` | Print help | |

### Analysis Profiles

`--profile` selects the depth and breadth of the two-pass analysis.

| Profile | Shallow / deep depth | MultiPV | Critical moments | Best for |
|---------|----------------------|---------|------------------|----------|
| `quick` | 12 / 16 | 1 | ~15% of moves | Fast overview, blitz games |
| `standard` | 14 / 22 | 3 | ~25% of moves | Balanced analysis (default) |
| `deep` | 18 / 28 | 5 | ~35% of moves | Thorough study, tournament games |

### Speed Tiers

`--speed` (and `ultraFastCoach.speed`) selects the engine-exploration tier, which is separate from the analysis profile above.

| `--speed` | Tier | Depth | Time limit | MultiPV |
|-----------|------|-------|------------|---------|
| `fast` | shallow | 12 | 1.5s | 1 |
| `normal` | standard | 18 | 5s | 3 |
| `deep` | full | 22 | 15s | 5 |

### Models

Prices are per 1M tokens, from `packages/llm/src/cost/pricing.ts`.

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `gpt-5-mini` | $0.25 | $2.00 | Cost-effective quality analysis (default) |
| `gpt-5-nano` | $0.05 | $0.40 | Fast, budget-friendly annotations |
| `gpt-5` | $1.25 | $10.00 | Full GPT-5 capabilities |
| `gpt-5-codex` | $1.25 | $10.00 | Deep analysis with reasoning |

Reasoning models (`gpt-5`, `gpt-5-codex`, `o1`, `o3-mini`) also bill reasoning tokens; unknown models fall back to a conservative default estimate.

```bash
# Budget-friendly annotations
chessbeast analyze --input game.pgn --model gpt-5-nano

# Deep reasoning
chessbeast analyze --input game.pgn --model gpt-5-codex --reasoning-effort high
```

### Reasoning Effort

`--reasoning-effort` applies to reasoning models (`gpt-5`, `gpt-5-codex`, `o1`, `o3`).

| Level | Behavior |
|-------|----------|
| `none` | Disable reasoning (standard completion, fastest) |
| `low` | Minimal reasoning for faster responses |
| `medium` | Balanced reasoning for quality analysis (default) |
| `high` | Maximum reasoning for complex positions (slowest, most thorough) |

### Perspective

| Value | Point of view | Example |
|-------|---------------|---------|
| `neutral` | Objective third person (default) | "White gains a tempo" |
| `white` | From White's side | "We gain a tempo" |
| `black` | From Black's side | "They gain a tempo" |

Set `--perspective white` when reviewing your own game as White to get personalized "we/they" commentary.

### Audience

| Value | Explanations |
|-------|--------------|
| `beginner` | Simple explanations, basic terms, evaluations hidden |
| `club` | Club-player level (default) |
| `expert` | Advanced terminology, less hand-holding |

### Comment Density

| Value | Behavior |
|-------|----------|
| `sparse` | Fewer comments, key moments only |
| `normal` | Standard density (default) |
| `verbose` | More frequent comments |

### Themes

| Value | Behavior |
|-------|----------|
| `none` | No theme detection |
| `important` | Only significant themes (default) |
| `all` | All detected themes |

### Variations

| Value | Behavior |
|-------|----------|
| `low` | Minimal variations |
| `medium` | Standard exploration (default) |
| `high` | Deep variation trees |

## Debug Mode

`--verbose` streams the LLM's reasoning as annotations are generated. `--debug` is a superset: it adds move context (FEN, evaluation, best move, and classification for each analyzed position) and full untruncated reasoning. Debug output goes to stderr, so the annotated PGN on stdout stays clean:

```bash
# Save the PGN while capturing debug logs
chessbeast analyze --input game.pgn --debug > annotated.pgn 2> debug.log

# View debug output live while saving the PGN
chessbeast analyze --input game.pgn --debug 2>&1 | tee analysis.log
```

For a live visual view of exploration and narration, use `--debug-gui`; see [packages/debug-gui/README.md](../packages/debug-gui/README.md).

## Viewing Resolved Configuration

Use `--show-config` to print the final merged configuration (defaults, config file, environment variables, and CLI arguments) and exit:

```bash
chessbeast analyze --show-config
```
