TDD: AI Chess Annotator

1. High-Level Architecture

Key components:
	1.	PGN Parser & Normalizer
	2.	Game Model & Position Generator
	3.	Engine Service (Stockfish)
	4.	Maia Service (human‑likeness / rating estimator)
	5.	Game Database Service (openings & reference games)
	6.	Critical Moment Detector
	7.	Annotation Planner (what to annotate and how deeply)
	8.	LLM Annotation Generator
	9.	PGN Renderer
	10.	Orchestrator / API Layer
	11.	Storage & Caching

Data flow (simplified):

PGN → Parser → Positions → Engine + Maia + DB → Critical Moments → Annotation Plan → LLM → Annotated PGN

⸻

1.1 Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| CLI & Orchestration | TypeScript / Node.js 18+ | Main entry point, coordinates pipeline |
| PGN Parsing/Rendering | TypeScript | Using chess.js or similar |
| Stockfish Service | Python 3.10+ + gRPC | UCI wrapper with connection pooling |
| Maia Service | Python 3.10+ + gRPC | Maia2 PyTorch model serving (`pip install maia2`) |
| Inter-service Comm | gRPC + Protobuf | Efficient binary protocol |
| Database | SQLite | ECO openings + Lichess Elite games |
| LLM | OpenAI API (GPT-5) | Reasoning model with streaming support |

⸻

1.2 Directory Structure

```
chessbeast/
├── packages/                    # TypeScript packages
│   ├── cli/                     # CLI entry point
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── core/                    # Core analysis logic
│   │   ├── src/
│   │   │   ├── analyzer/        # Analysis pipeline
│   │   │   ├── classifier/      # Move classification
│   │   │   └── planner/         # Annotation planning
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── pgn/                     # PGN parsing/rendering
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   └── renderer/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── grpc-client/             # gRPC client stubs
│       ├── src/
│       │   └── generated/       # Auto-generated from protos
│       ├── package.json
│       └── tsconfig.json
├── services/                    # Python services
│   ├── stockfish/               # Stockfish gRPC service
│   │   ├── src/
│   │   │   ├── engine.py        # UCI wrapper
│   │   │   ├── server.py        # gRPC server
│   │   │   └── pool.py          # Connection pooling
│   │   └── pyproject.toml
│   ├── maia/                    # Maia gRPC service
│   │   ├── src/
│   │   │   ├── model.py         # Model loading/inference
│   │   │   └── server.py        # gRPC server
│   │   ├── models/              # Downloaded model weights
│   │   └── pyproject.toml
│   └── protos/                  # Shared protobuf definitions
│       ├── common.proto
│       ├── stockfish.proto
│       └── maia.proto
├── data/                        # Local databases
│   ├── eco.db                   # ECO opening database
│   └── lichess_elite.db         # Lichess Elite games
├── scripts/                     # Setup and utility scripts
│   ├── download-stockfish.sh
│   ├── download-maia-models.sh
│   └── setup-database.sh
├── package.json                 # Root package.json (workspaces)
├── tsconfig.base.json           # Shared TS config
├── PRD.md
├── TDD.md
└── TASKS.md
```

⸻

1.3 gRPC Service Definitions

**common.proto**
```protobuf
syntax = "proto3";
package chessbeast;

message Position {
  string fen = 1;
}

message Move {
  string san = 1;      // Standard Algebraic Notation
  string uci = 2;      // UCI format (e.g., "e2e4")
}
```

**stockfish.proto**
```protobuf
syntax = "proto3";
package chessbeast.stockfish;

import "common.proto";

service StockfishService {
  rpc Evaluate(EvaluateRequest) returns (EvaluateResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message EvaluateRequest {
  string fen = 1;
  int32 depth = 2;           // Search depth (0 = use time limit)
  int32 time_limit_ms = 3;   // Time limit in milliseconds
  int32 multipv = 4;         // Number of principal variations (default 1)
  int64 nodes = 5;           // Node limit (0 = no limit)
}

message EvaluateResponse {
  int32 cp = 1;              // Centipawns (from side to move)
  int32 mate = 2;            // Mate in N (0 if not mate)
  int32 depth = 3;           // Actual depth searched
  repeated string best_line = 4;  // Best line in UCI
  repeated EvaluateResponse alternatives = 5;  // MultiPV results
}

message HealthCheckRequest {}
message HealthCheckResponse {
  bool healthy = 1;
  string version = 2;        // Stockfish version
}
```

**maia.proto**
```protobuf
syntax = "proto3";
package chessbeast.maia;

// Uses Maia2 (NeurIPS 2024) - a unified model for human-like chess predictions
service MaiaService {
  rpc PredictMoves(PredictRequest) returns (PredictResponse);
  rpc EstimateRating(EstimateRatingRequest) returns (EstimateRatingResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message PredictRequest {
  string fen = 1;
  int32 rating_band = 2;     // Player ELO rating (any value, e.g., 800-2800)
}

message MovePrediction {
  string move = 1;           // UCI format
  float probability = 2;     // 0.0 - 1.0
}

message PredictResponse {
  repeated MovePrediction predictions = 1;
}

message EstimateRatingRequest {
  repeated GameMove moves = 1;
}

message GameMove {
  string fen = 1;
  string played_move = 2;    // UCI format
}

message EstimateRatingResponse {
  int32 estimated_rating = 1;
  int32 confidence_low = 2;  // Lower bound of estimate
  int32 confidence_high = 3; // Upper bound of estimate
}

message HealthCheckRequest {}
message HealthCheckResponse {
  bool healthy = 1;
  repeated int32 loaded_models = 2;  // Model types loaded (Maia2 uses single unified model)
}
```

⸻

2. Data Model

2.1 Core Types (conceptual)

type GameMetadata = {
  event?: string;
  site?: string;
  date?: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  timeControl?: string;
};

type PositionId = string; // FEN

type MoveInfo = {
  moveNumber: number;
  san: string;
  from: string;
  to: string;
  isWhiteMove: boolean;
  fenBefore: PositionId;
  fenAfter: PositionId;
};

type EngineEval = {
  cp?: number;       // centipawns from side to move
  mate?: number;     // mate in N (positive means side to move mates)
  depth: number;
  bestLine: string[]; // SAN or UCI sequence
  multiPV?: EngineEval[]; // top N alternatives
};

type MaiaEval = {
  predictedMoves: { move: string; probability: number }[];
  impliedRatingEstimate?: number;
};

type MoveClassification = "book" | "excellent" | "good" |
  "inaccuracy" | "mistake" | "blunder" | "brilliant" | "forced";

type MoveAnalysis = {
  move: MoveInfo;
  engineEvalBefore: EngineEval;
  engineEvalAfter: EngineEval;
  engineBestMove: string;
  engineBestEval: EngineEval;
  classification: MoveClassification;
  humanLikelihood: number; // probability from Maia
  isCriticalMoment: boolean;
  annotations?: {
    textComment?: string;
    nags?: string[]; // e.g. ["$2", "$4"]
    sidelines?: SideLine[];
  };
};

type SideLine = {
  moves: string[];         // SAN sequence
  finalEval: EngineEval;
  purposeTag: "tactical" | "strategic" | "simplifying" | "defensive";
};

type OpeningInfo = {
  eco?: string;
  name?: string;
  mainLine?: string[];
  leftTheoryAtMove?: number;
  referenceGames?: ReferenceGame[];
};

type ReferenceGame = {
  id: string;
  event?: string;
  white: string;
  black: string;
  result: string;
};


⸻

3. Component Design

3.1 PGN Parser & Normalizer
	•	Use a robust PGN parsing library or implement:
	•	Tags parsing.
	•	Move text parsing (including comments/variations if present).
	•	Output:
	•	GameMetadata
	•	List of MoveInfo with FENs before/after each move.
	•	Validate legality of moves with an internal chess rules engine.

3.2 Engine Service (Stockfish)
	•	Run Stockfish as a UCI engine (local or via service).
	•	Expose a simple async API:

evaluatePosition(fen: string, config: {
  depth?: number;
  nodes?: number;
  multipv?: number;
  timeLimitMs?: number;
}): Promise<EngineEval>;

	•	Implement:
	•	Connection pooling (multiple engine instances).
	•	Global budget per game (max total engine time / nodes).
	•	Cancellation / timeouts.

3.3 Maia Service (Maia2)
	•	Wrap the Maia2 unified model behind an API:

predictHumanMoves(fen: string, playerElo: number): Promise<MaiaEval>;
estimateRatingFromGame(game: MoveInfo[]): Promise<number>;

	•	Implementation detail:
	•	Uses Maia2 (NeurIPS 2024) - a single unified model that handles all rating levels
	•	Install via `pip install maia2`
	•	Supports continuous ELO (any rating value, not just fixed bands)
	•	Returns both move probabilities and win probability

3.4 Game Database Service
	•	Abstract source of opening and game data:

getOpeningInfo(movesUci: string[]): Promise<OpeningInfo>;
getReferenceGames(fen: string, limit: number): Promise<ReferenceGame[]>;

	•	Internally can use:
	•	Local ECO database for opening names.
	•	External or local database for reference games (e.g., Lichess DB subset).

3.5 Critical Moment Detector

Goal: Decide which positions get deep analysis and commentary.

Inputs:
	•	Sequence of EngineEval before/after each move (from shallow pass).
	•	Player ratings (from metadata or Maia).
	•	Game phase (opening/middlegame/endgame).

Heuristics (simplified):
	•	For each move:
	•	Centipawn loss = eval(bestMove) − eval(playedMove) from player’s perspective.
	•	Rating-dependent thresholds:
	•	e.g. for ~1400 Elo:
	•	inaccuracy: 50–149 cp
	•	mistake: 150–299 cp
	•	blunder: ≥300 cp
	•	thresholds scale with rating.
	•	Game-result impact:
	•	“win → draw”, “draw → loss”, or “win → unclear” transitions are automatically critical.
	•	Volatility:
	•	Large eval swings in consecutive moves mark a “tactical storm” zone.

Output:
	•	Mark MoveAnalysis.isCriticalMoment = true if any of:
	•	Classification ≥ mistake.
	•	Eval swing surpasses threshold.
	•	Game phase transition.
	•	Keep a cap (e.g., max 25% of moves) by:
	•	Ranking moments by “interestingness score”.
	•	Truncating low-importance ones.

3.6 Annotation Planner

Goal: For each critical moment, decide:
	•	What themes to highlight.
	•	Which sidelines to include.
	•	How deep to analyze.

Steps:
	1.	Deep evaluation:
	•	For each critical moment, re-run engine with higher depth and multipv >= 2.
	•	Choose up to N alternatives where:
	•	The eval is within a certain band of best move.
	•	The move differs meaningfully in plan (e.g., different pawn break, piece sacrifice).
	2.	Theme detection (heuristic tags):
	•	Identify motifs from best lines:
	•	Tactics: hanging piece, fork, pin, discovered attack, forced mate.
	•	Strategy: weak square, bad bishop, pawn majority, open file, endgame race.
	•	Can be partly engine-derived (e.g., forced tactics) and partly LLM-inferred.
	3.	Plan creation:
	•	For each critical moment, build a compact AnnotationPlan object summarizing:
	•	Position context (move number, phase, opening name).
	•	Evaluation before/after.
	•	Reason for criticality (big blunder, missed win, etc.).
	•	1–3 key sidelines with high-level purpose tags.
	•	Player rating and human-likeness score.

This plan is the main structured input to the LLM.

### 3.6.1 Variation Explorer

The annotation planner integrates with a `VariationExplorer` that iteratively builds deep variations:

**Key interfaces:**
- `ExplorationSession`: Tracks position, explored lines, LLM call count, budget caps
- `ExploredLine`: Moves, annotations, branches, purpose (best/human_alternative/refutation/trap), source (engine/maia)

**Exploration flow:**
1. Engine provides best line, Maia suggests human-likely alternative
2. LLM decides exploration strategy via `ExplorationDecision`
3. Depth-first: Follow main line deep (up to 40 moves)
4. Show human mistakes when instructive
5. Self-regulating budget: 15-20 soft cap, can extend to 22 if LLM requests more

**Configuration:**

```typescript
interface ExplorationConfig {
  maxDepth?: number;        // Default: 40
  softCallCap?: number;     // Default: 15
  hardCallCap?: number;     // Default: 22
  engineDepth?: number;     // Default: 22
  engineTimeLimitMs?: number; // Default: 5000
}
```

3.7 LLM Annotation Generator

Interface:

generateAnnotations(
  gameMeta: GameMetadata,
  openingInfo: OpeningInfo,
  moves: MoveAnalysis[],
  config: AnnotationConfig
): Promise<MoveAnalysis[]>; // same moves but with textComment / nags / sidelines filled

Implementation:
	•	Chunk the game into manageable groups of critical moments (e.g., 10–20 positions per LLM call).
	•	For each chunk:
	•	Build a prompt with:
	•	Brief description of the game and player levels.
	•	Opening info and phase transitions.
	•	For each position:
	•	FEN, move in SAN, evals (before/after), best line(s).
	•	Reason why it's critical & themes from planner.
	•	Ask LLM to:
	•	Provide concise comments for each move.
	•	Suggest NAGs.
	•	Optionally refine/rename sidelines (keeping moves intact).
	•	Parse LLM output into structured annotations, validating:
	•	That NAG codes are from an allowed set.
	•	That move identifiers match known positions.

### 3.7.1 Reasoning Model Support

The LLM client supports OpenAI reasoning models (gpt-5, o1, o3) with configurable reasoning effort:

**Key interfaces:**
- `ReasoningEffort`: 'none' | 'low' | 'medium' | 'high' - controls depth of model reasoning
- `StreamChunk`: Real-time streaming of thinking content and final response
- `TokenUsage`: Tracks thinking tokens separately from completion tokens

**Configuration:**

```typescript
interface LLMConfig {
  model: string;              // e.g., "gpt-5"
  reasoningEffort: ReasoningEffort; // Default: "medium"
  streaming: boolean;         // Default: true
  temperature: number;
  timeout: number;
}
```

**Streaming flow:**
1. Client sends request with `reasoning_effort` parameter
2. Model streams `reasoning_content` chunks (thinking process)
3. Model streams final `content` chunks (response)
4. Progress callback receives chunks for real-time display
5. Token usage includes separate `thinkingTokens` count

**Verbose mode:**
- When `--verbose` flag is set, reasoning thoughts are displayed in real-time
- Shows model's step-by-step analysis of each position
- Helps users understand how annotations were generated

### 3.7.2 Agentic Annotation Mode

The LLM can optionally use OpenAI function calling to query external services for richer annotations.

**Key interfaces:**
- `AgenticServices`: Connection to Stockfish, Maia, ECO database, Lichess Elite database
- `ToolExecutor`: Dispatches tool calls to appropriate services
- `AgenticGenerator`: Manages the agentic loop (prompt → tool calls → tool results → response)

**Available tools:**

| Tool | Parameters | Description |
|------|------------|-------------|
| `evaluate_position` | `fen`, `depth?`, `multipv?` | Get Stockfish evaluation |
| `predict_human_moves` | `fen`, `rating?` | Get Maia predictions for human-likely moves |
| `lookup_opening` | `fen` | Query ECO database for opening name |
| `find_reference_games` | `fen`, `limit?` | Search Lichess Elite games database |
| `make_move` | `fen`, `move` | Apply a move and get resulting position |

**Agentic loop flow:**
1. Format rich context with position details, game info, and previous analysis
2. Send prompt with tool definitions to LLM
3. If LLM requests tool calls, execute them via `ToolExecutor`
4. Return tool results to LLM
5. Repeat until LLM provides final annotation or max tool calls reached

**Configuration:**

```typescript
interface AgenticConfig {
  enabled: boolean;          // Default: false
  annotateAll: boolean;      // Default: false (critical moments only)
  maxToolCalls: number;      // Default: 5
  showCosts: boolean;        // Default: true
}
```

**Cost tracking:**
- `CostTracker`: Accumulates token usage across API calls
- `MODEL_PRICING`: Per-model pricing (input, output, reasoning tokens per 1M)
- Supports GPT-4o, GPT-4o-mini, o1, gpt-5 models
- Cost summary displayed with `--show-costs` flag

3.8 PGN Renderer
	•	Merge:
	•	Original game moves.
	•	MoveAnalysis.annotations (comments, NAGs, variations).
	•	Ensure:
	•	Correct placement of comments (before/after SAN).
	•	Proper use of parentheses for sidelines ( ... ).
	•	Escape braces and brackets inside comments.
	•	Add overall summary as comments in the header or before first move.

Example snippet (conceptual):

[Event "Example"]
[White "Alex"]
[Black "Bot"]
[Result "0-1"]

1. e4 {A common and strong first move, controlling the center.} $1 e5
2. Nf3 Nc6 3. Bb5 {Ruy Lopez.} a6 4. Ba4 Nf6
(4... b5 5. Bb3 Nf6 {A main theoretical line.}) 5. O-O ...


⸻

4. Algorithms & Heuristics Details

4.1 Move Classification

Let:
	•	evalBest = engine eval after best move (from player’s viewpoint).
	•	evalPlayed = engine eval after played move.
	•	delta = evalBest - evalPlayed (positive means played move is worse).

Thresholds depend on estimated Elo R. Example (rough):
	•	For R ≈ 1200:
	•	inaccuracy: 50–149 cp
	•	mistake: 150–299 cp
	•	blunder: ≥300 cp
	•	For R ≈ 2000:
	•	inaccuracy: 30–89 cp
	•	mistake: 90–179 cp
	•	blunder: ≥180 cp

These can be linear interpolations between bands. Additional rules:
	•	"Only move": if only one move keeps result (win/draw/loss) and played that, label as forced $1.
	•	"Brilliant": if played move is low-probability from Maia2 but engine-best and tactically striking (e.g., sacrifice, big eval increase).

**NAG Insertion Rules:**
- Position NAGs (`$10`-`$19`) only added for significant eval changes (≥150cp threshold)
- Move quality NAG `$1` (good move) only added for critical positions
- Maximum 2 consecutive position NAGs allowed (clustering prevention, except for errors/brilliancies)

4.2 Depth Control
	•	Pass 1 (shallow):
	•	depth = D1 (e.g., 12–16) for every position.
	•	Used for:
	•	Basic eval.
	•	Rough move classification.
	•	Pass 2 (deep):
	•	For critical positions only:
	•	depth = D2 (e.g., 20–24) or time-limited.
	•	multipv = 3 (configurable).
	•	For complex tactical spots (high volatility, big swings):
	•	Allow more time or nodes.
	•	Implement per-game compute budget:
	•	maxNodesPerGame, maxTimeMsPerGame.
	•	Orchestrator adjusts D2/time to fit under budget:
	•	Many critical positions → slightly shallower per position.
	•	Few critical positions → deeper analysis.

⸻

5. API Design

5.1 Public API (library)

type AnalysisConfig = {
  profile?: "quick" | "standard" | "deep";
  verbosity?: "summary" | "normal" | "rich";
  targetAudienceElo?: number;
  language?: string; // v1: "en"
  maxSidelinesPerCriticalMove?: number;
};

type AnalysisResult = {
  annotatedPgn: string;
  metadata: {
    game: GameMetadata;
    opening: OpeningInfo;
    moves: MoveAnalysis[];
    summaryLessons: string[];
  };
};

function analyzePgn(pgn: string, config?: AnalysisConfig): Promise<AnalysisResult>;

5.2 CLI (optional)

explainchess analyze --input game.pgn --output annotated.pgn \
  --profile standard --verbosity rich --target-elo 1600


⸻

6. Error Handling & Fallbacks
	•	Invalid PGN:
	•	Return structured error with location and reason.
	•	Engine failure / timeout:
	•	Retry with another instance or reduced depth.
	•	If still failing, degrade gracefully:
	•	Use whatever evals are available.
	•	Possibly skip deep analysis for some positions.
	•	Maia2 unavailable:
	•	Skip human-likeness and rating estimation; fall back to metadata ratings or generic thresholds.
	•	LLM failure:
	•	Retry once.
	•	If still failing:
	•	Option 1: Return minimal annotations (NAGs + basic comments).
	•	Option 2: Mark commentary as partial.

⸻

7. Testing Strategy

7.1 Unit Tests
	•	PGN parsing (including edge cases).
	•	FEN generation and legality checks.
	•	Move classification logic (synthetic test cases with known eval deltas).
	•	Critical moment detection ranking and truncation.

7.2 Integration Tests
	•	Full pipeline on a curated set of:
	•	GM games with known turning points.
	•	Amateur games with obvious blunders.
	•	Assert:
	•	PGN output is valid and loadable.
	•	Critical blunders are identified.
	•	No obviously nonsense annotations (basic sanity checks).

7.3 Golden Tests
	•	Maintain a small corpus of input PGNs with approved annotated outputs.
	•	On changes, compare new output to golden, allow limited diff (e.g., minor wording changes) but enforce structural stability (same number of annotated moves, etc.).

7.4 Performance & Load Tests
	•	Batch analyze many games to:
	•	Validate per-game compute budget control.
	•	Measure throughput and resource usage.

⸻

8. Observability & Telemetry
	•	Log per game:
	•	Number of moves, number of critical moments.
	•	Engine time per game.
	•	LLM tokens per game.
	•	Optionally log (with privacy in mind):
	•	User ratings and configs (not names) to tune thresholds.
	•	Anonymous feedback hooks ("was this annotation helpful?" score).

⸻

9. Database Schema

9.1 ECO Opening Database (eco.db)

```sql
CREATE TABLE openings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eco_code TEXT NOT NULL,           -- e.g., "B90"
  name TEXT NOT NULL,               -- e.g., "Sicilian Defense: Najdorf Variation"
  moves TEXT NOT NULL,              -- e.g., "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6"
  moves_uci TEXT NOT NULL,          -- UCI format for matching
  fen_after TEXT,                   -- FEN after the moves
  parent_eco TEXT,                  -- Parent opening ECO code
  is_mainline BOOLEAN DEFAULT 0     -- Is this the main line for this ECO?
);

CREATE INDEX idx_eco_code ON openings(eco_code);
CREATE INDEX idx_moves_uci ON openings(moves_uci);
CREATE INDEX idx_fen_after ON openings(fen_after);
```

9.2 Lichess Elite Database (lichess_elite.db)

```sql
CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lichess_id TEXT UNIQUE,           -- Original Lichess game ID
  event TEXT,
  white TEXT NOT NULL,
  black TEXT NOT NULL,
  white_elo INTEGER,
  black_elo INTEGER,
  result TEXT,                      -- "1-0", "0-1", "1/2-1/2"
  date TEXT,
  eco TEXT,
  moves TEXT NOT NULL,              -- PGN movetext
  moves_uci TEXT NOT NULL           -- UCI format for searching
);

CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  fen_hash TEXT NOT NULL,           -- Hash of FEN (for fast lookup)
  fen TEXT NOT NULL,
  move_number INTEGER,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX idx_games_eco ON games(eco);
CREATE INDEX idx_games_white ON games(white);
CREATE INDEX idx_games_black ON games(black);
CREATE INDEX idx_games_elo ON games(white_elo, black_elo);
CREATE INDEX idx_positions_fen_hash ON positions(fen_hash);
CREATE INDEX idx_positions_game ON positions(game_id);
```

⸻

10. External Dependencies

10.1 Required Software

| Dependency | Version | Purpose | Installation |
|------------|---------|---------|--------------|
| Node.js | 18+ | TypeScript runtime | https://nodejs.org |
| Python | 3.10+ | ML services | https://python.org |
| Stockfish | 16+ | Chess engine | https://stockfishchess.org |
| protoc | 3.x | Protobuf compiler | Package manager |

10.2 Maia2 Model

Maia2 is installed as a Python package and handles model downloads automatically:

```bash
pip install maia2
```

| Component | Description |
|-----------|-------------|
| Package | `maia2` (PyPI) |
| Model Type | Unified model for all rating levels |
| Rating Support | Continuous ELO (any rating, e.g., 800-2800) |
| Game Types | "rapid" or "blitz" |
| Device Support | CPU or CUDA (GPU) |

**Key advantages over original Maia:**
- Single unified model instead of 9 separate rating-band models
- Supports any ELO rating as a continuous parameter
- Automatic model download and caching
- Returns both move probabilities and win probability

Source: https://github.com/CSSLab/maia2 (NeurIPS 2024 paper)

10.3 Database Files

| Database | Source | Size | Notes |
|----------|--------|------|-------|
| ECO Openings | Various sources | ~1MB | Pre-populated with ~500 ECO codes |
| Lichess Elite | Lichess.org | ~2GB | Games from 2200+ rated players |

Download: https://database.lichess.org/

10.4 API Keys

| Service | Environment Variable | Purpose |
|---------|---------------------|---------|
| OpenAI | `OPENAI_API_KEY` | LLM annotations (GPT-4o) |

⸻
