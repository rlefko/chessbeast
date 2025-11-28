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
    "timeout": 30000
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
| `llm.model` | string | `"gpt-5-codex"` | OpenAI model to use |
| `llm.temperature` | number | 0.7 | Model temperature (0.0-2.0) |
| `llm.timeout` | number | 30000 | Request timeout in milliseconds |

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
