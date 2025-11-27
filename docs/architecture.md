# Architecture

ChessBeast is a hybrid TypeScript + Python monorepo that combines multiple analysis engines to produce human-friendly chess game annotations.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI (TypeScript)                            │
│  Input: PGN file + configuration                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PGN Parser (@chessbeast/pgn)                      │
│  Parses PGN files into structured game data with FEN positions       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Analysis Pipeline (@chessbeast/core)                  │
│                                                                       │
│  Pass 1 (Shallow): All positions @ depth 14-16                       │
│    ├─ Stockfish evaluation via gRPC                                  │
│    ├─ Opening recognition via ECO database                           │
│    └─ Initial move classification                                    │
│                                                                       │
│  Pass 2 (Critical Detection): Identify turning points                │
│    └─ Score positions by "interestingness", cap at ~25%              │
│                                                                       │
│  Pass 3 (Deep): Critical positions @ depth 20-24, multipv=3          │
│    ├─ Deep engine analysis with alternatives                         │
│    └─ Maia human-likeness prediction via gRPC                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│               LLM Annotation (@chessbeast/llm)                       │
│                                                                       │
│  Plan: Select positions for annotation (token budget aware)          │
│  Generate: OpenAI API calls with chess context                       │
│  Validate: Check NAGs and move references                            │
│  Fallback: Template-based comments if API fails                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PGN Renderer (@chessbeast/pgn)                      │
│  Transforms analysis back to annotated PGN format                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Output                                       │
│  Annotated PGN file with comments, NAGs, and variations              │
└──────────────────────────────────────────────────────────────────────┘
```

## Package Structure

### TypeScript Packages (`packages/`)

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| **cli** | CLI entry point, orchestration, configuration | `analyze` command, config loader |
| **core** | Analysis pipeline, move classification, critical moments | `AnalysisPipeline`, `GameAnalysis` |
| **pgn** | PGN parsing and rendering | `PgnParser`, `PgnRenderer`, `ParsedGame` |
| **grpc-client** | gRPC clients for Python services | `StockfishClient`, `MaiaClient` |
| **database** | SQLite database clients | `EcoClient`, `LichessEliteClient` |
| **llm** | OpenAI integration, annotation generation | `CommentGenerator`, `AnnotationPlanner` |
| **test-utils** | Shared test utilities and mocks | Test fixtures, mock services |

### Python Services (`services/`)

| Service | Port | Purpose |
|---------|------|---------|
| **stockfish** | 50051 | UCI engine wrapper for position evaluation |
| **maia** | 50052 | Maia2 model serving for human-likeness prediction |

### Data (`data/`)

| Database | Purpose |
|----------|---------|
| `eco.db` | ECO opening classification lookup |
| `lichess_elite.db` | Reference games from Lichess Elite (2200+) |

## Package Dependencies

```
cli (main entry point)
├── core
│   ├── pgn
│   ├── grpc-client
│   └── database
├── pgn
├── llm
│   ├── core
│   └── pgn
├── grpc-client
├── database
└── test-utils

core
├── pgn
├── grpc-client
└── database

llm
├── core
└── pgn
```

## Key Data Types

### GameAnalysis

The central output type containing complete game analysis:

```typescript
interface GameAnalysis {
  metadata: {
    white: string;
    black: string;
    result: string;
    event?: string;
    eco?: string;
    openingName?: string;
    whiteElo?: number;
    blackElo?: number;
  };
  moves: MoveAnalysis[];
  criticalMoments: CriticalMoment[];
  stats: GameStats;
  summary?: string;
}
```

### MoveAnalysis

Analysis for a single move:

```typescript
interface MoveAnalysis {
  plyIndex: number;
  moveNumber: number;
  isWhiteMove: boolean;
  san: string;                    // Standard Algebraic Notation
  fenBefore: string;
  fenAfter: string;
  evalBefore: EngineEvaluation;
  evalAfter: EngineEvaluation;
  bestMove: string;               // Engine's best move
  cpLoss: number;                 // Centipawn loss
  classification: MoveClassification;
  humanProbability?: number;      // From Maia (0-1)
  alternatives?: AlternativeMove[];
  isCriticalMoment: boolean;
  comment?: string;               // LLM annotation
}
```

### MoveClassification

```typescript
type MoveClassification =
  | 'book'       // Opening theory
  | 'excellent'  // Best or near-best
  | 'good'       // Solid move
  | 'inaccuracy' // Minor error
  | 'mistake'    // Moderate error
  | 'blunder'    // Major error
  | 'brilliant'  // Unexpected excellence
  | 'forced'     // Only reasonable option
```

## Two-Pass Analysis Strategy

ChessBeast uses a two-pass analysis approach to balance depth with efficiency:

### Pass 1: Shallow Analysis
- **Depth**: 12-16 (profile dependent)
- **Scope**: All positions
- **Purpose**: Quick evaluation, opening detection, initial classification

### Pass 2: Deep Analysis
- **Depth**: 20-28 (profile dependent)
- **Scope**: Critical moments only (~25% of moves)
- **MultiPV**: 3-5 lines
- **Purpose**: Alternative variations, detailed evaluation

## Critical Moment Detection

Critical moments are identified based on:

| Type | Description |
|------|-------------|
| `eval_swing` | Large evaluation change (>100cp) |
| `result_change` | Position changed from winning to losing/drawn |
| `missed_win` | Player missed a winning move |
| `missed_draw` | Player missed a drawing move |
| `phase_transition` | Opening→middlegame or middlegame→endgame |
| `tactical_moment` | Forcing sequence or sacrifice opportunity |
| `blunder_recovery` | Recovery from a previous mistake |

Moments are scored by "interestingness" (0-100) and capped at `maxCriticalRatio` of total moves.

## Move Classification Thresholds

Thresholds are rating-dependent to account for different skill levels:

### 1200 ELO
| Classification | Centipawn Loss |
|----------------|----------------|
| Inaccuracy | 50-149 |
| Mistake | 150-299 |
| Blunder | ≥300 |

### 2000 ELO
| Classification | Centipawn Loss |
|----------------|----------------|
| Inaccuracy | 30-89 |
| Mistake | 90-179 |
| Blunder | ≥180 |

## Service Communication

Services communicate via gRPC with Protocol Buffers:

```
┌─────────────┐      gRPC       ┌─────────────────┐
│ TypeScript  │ ◄────────────►  │ Python Services │
│ Orchestrator│   (protobuf)    │ (Stockfish/Maia)│
└─────────────┘                 └─────────────────┘
```

Proto definitions are in `services/protos/`:
- `common.proto` - Shared types (Position, Move)
- `stockfish.proto` - Engine evaluation service
- `maia.proto` - Human-likeness prediction service

## Error Handling

ChessBeast implements graceful degradation:

1. **Maia unavailable**: Continue without human-likeness scores
2. **LLM unavailable**: Fall back to template-based comments
3. **Database unavailable**: Skip opening/reference game lookup
4. **Engine timeout**: Use partial results or skip position

Use `--skip-maia` and `--skip-llm` flags for offline analysis.
