# ChessBeast - Implementation Tasks

## Technology Stack Summary

| Component | Technology |
|-----------|------------|
| CLI & Orchestration | TypeScript / Node.js |
| PGN Parsing/Rendering | TypeScript |
| Stockfish Service | Python + gRPC |
| Maia Service | Python + gRPC |
| Inter-service Comm | gRPC with Protobuf |
| Database | SQLite (ECO + Lichess Elite) |
| LLM | OpenAI GPT-4o (upgradeable to GPT-5) |
| Deployment | Local CLI |

---

## Pre-Milestone: Update PRD & TDD with Technology Decisions ✅

### Update PRD.md
- [x] Add "Technology Decisions" section specifying:
  - Hybrid architecture (TypeScript + Python)
  - OpenAI GPT-4o/GPT-5 for LLM
  - gRPC for inter-service communication
  - Local CLI deployment target
- [x] Update non-goals to clarify cloud deployment is out of scope for v1
- [x] Add Maia as explicit core requirement in Goals section

### Update TDD.md
- [x] Add "Technology Stack" section:
  - TypeScript/Node.js for CLI, orchestration, PGN handling
  - Python for ML services (Stockfish, Maia)
  - gRPC with protobuf for service communication
  - SQLite for local database (ECO + Lichess Elite)
  - OpenAI API for LLM integration
- [x] Update component design to reflect hybrid architecture
- [x] Add gRPC service definitions (proto schemas)
- [x] Add directory structure for monorepo
- [x] Update API design to show TypeScript interfaces
- [x] Add database schema section for:
  - ECO opening lookup table
  - Lichess Elite games with FEN indexing
- [x] Add "External Dependencies" section listing:
  - Stockfish binary requirements
  - Maia model weights
  - Lichess database download
  - OpenAI API key

---

## Milestone 0: Project Setup & Infrastructure ✅

### 0.1 Repository Setup
- [x] Initialize git repository
- [x] Create monorepo structure with workspaces (pnpm + Turborepo)
- [x] Set up `.gitignore` for Node, Python, and data files

### 0.2 TypeScript Project Setup
- [x] Initialize Node.js project with TypeScript
- [x] Configure `tsconfig.json` with strict settings
- [x] Set up ESLint + Prettier
- [x] Configure Vitest for testing (chosen over Jest for better ESM support)
- [x] Create initial directory structure:
  ```
  packages/
    cli/           # CLI entry point
    core/          # Core analysis logic
    pgn/           # PGN parsing/rendering
    grpc-client/   # gRPC client stubs
  ```

### 0.3 Python Project Setup
- [x] Initialize Python project with uv
- [x] Configure pyproject.toml
- [x] Set up pytest + mypy
- [x] Create initial directory structure:
  ```
  services/
    stockfish/     # Stockfish gRPC service
    maia/          # Maia gRPC service
    protos/        # Shared protobuf definitions
  ```

### 0.4 gRPC Infrastructure
- [x] Define protobuf schemas for:
  - `stockfish.proto` - position evaluation
  - `maia.proto` - human-likeness prediction
  - `common.proto` - shared types (Position, Move, etc.)
- [x] Generate TypeScript client stubs (StockfishClient, MaiaClient with dynamic proto loading)
- [x] Generate Python server stubs
- [x] Create basic connectivity test (unit tests for gRPC clients)

### 0.5 Development Environment
- [x] Create `docker-compose.yml` for local services
- [x] Document local setup requirements (Stockfish binary, Maia models)
- [x] Create scripts for running services locally (Makefile)

---

## Milestone 1: PGN Parser & Chess Core (TypeScript) ✅

### 1.1 PGN Parser
- [x] Implement PGN tag parser (Event, White, Black, Result, etc.)
- [x] Implement move text parser (SAN notation)
- [x] Handle existing comments and variations in input PGN
- [x] Parse NAG symbols ($1, $2, etc.)
- [x] Implement robust error handling with position info

### 1.2 Chess Position Model
- [x] Implement `Position` class (board state, castling rights, en passant)
- [x] Implement FEN serialization/deserialization
- [x] Implement move application (SAN → position update)
- [x] Validate move legality
- [x] Generate FEN for each position in game

### 1.3 Game Model
- [x] Define `GameMetadata` type
- [x] Define `MoveInfo` type with fenBefore/fenAfter
- [x] Define `ParsedGame` combining metadata + moves
- [x] Implement multi-game PGN parsing

### 1.4 Unit Tests
- [x] Test PGN parsing with various formats
- [x] Test illegal move detection
- [x] Test FEN generation accuracy
- [x] Test edge cases (promotions, castling, en passant)
- [ ] Add corpus of real PGNs for integration testing

---

## Milestone 2: Stockfish Service (Python + gRPC) ✅

### 2.1 UCI Engine Wrapper
- [x] Implement Stockfish process management (using python-chess)
- [x] Implement UCI protocol communication
- [x] Handle `position` and `go` commands
- [x] Parse engine output (info, bestmove)
- [x] Implement proper shutdown/cleanup

### 2.2 Evaluation API
- [x] Implement `evaluatePosition(fen, config)` method
- [x] Support depth-limited search
- [x] Support time-limited search
- [x] Support node-limited search
- [x] Implement MultiPV support (top N lines)

### 2.3 Connection Pooling
- [x] Implement engine instance pool
- [x] Handle concurrent evaluation requests
- [ ] Implement per-game budget tracking (total nodes/time) - deferred to orchestrator
- [x] Graceful degradation under load

### 2.4 gRPC Service
- [x] Implement `StockfishService` gRPC server
- [x] Define request/response messages
- [x] Add health check endpoint
- [x] Implement timeout handling
- [x] Add basic logging/metrics

### 2.5 Testing
- [x] Unit tests for UCI parsing (55 tests)
- [x] Integration tests with real Stockfish
- [x] Test concurrent evaluations
- [ ] Test budget enforcement - deferred with budget tracking

---

## Milestone 3: Maia Service (Python + gRPC) - Using Maia2 ✅

### 3.1 Model Loading (Maia2)
- [x] Install Maia2 package (`pip install maia2`)
- [x] Implement Maia2Model wrapper class
- [x] Support model types: "rapid" and "blitz"
- [x] Support device selection: CPU or CUDA

### 3.2 Move Prediction API
- [x] Implement `predictMoves(fen, playerElo)` method using Maia2
- [x] Support continuous ELO ratings (any value, not just fixed bands)
- [x] Return top moves with probabilities
- [x] Handle all legal positions

### 3.3 Rating Estimation
- [x] Implement `estimateRating(moves[])` method
- [x] Use Maia2's inference across multiple ELO values to find best fit
- [x] Return estimated rating with confidence bounds
- [x] Handle short games gracefully

### 3.4 Human-Likeness Scoring
- [x] For a position + played move, return P(human plays this) at given ELO
- [x] Support any ELO rating as continuous parameter
- [x] Define "natural but flawed" vs "engine-like" classification

### 3.5 gRPC Service
- [x] Implement `MaiaService` gRPC server
- [x] Implement PredictMoves, EstimateRating, HealthCheck RPCs
- [x] Add proper error handling with gRPC status codes
- [x] Load Maia2 model on startup

### 3.6 Testing
- [x] Unit tests with mocked Maia2 module
- [x] Test predictions against known positions
- [x] Test rating estimation accuracy
- [x] Test gRPC error handling

---

## Milestone 4: Basic Analysis Pipeline (TypeScript) ✅

### 4.1 Two-Pass Engine Analysis
- [x] Implement shallow pass (depth 12-16) for all positions
- [x] Track evaluation for each position
- [x] Calculate centipawn loss per move
- [x] Store results in `MoveAnalysis` structure

### 4.2 Move Classification
- [x] Implement rating-dependent thresholds
- [x] Classify moves: book, excellent, good, inaccuracy, mistake, blunder
- [x] Detect "forced" moves (only one reasonable option)
- [x] Detect "brilliant" moves (low Maia prob, high engine eval, sacrifice)

### 4.3 Critical Moment Detection
- [x] Detect large evaluation swings
- [x] Detect game-result transitions (win→draw, etc.)
- [x] Detect phase transitions (opening→middlegame→endgame)
- [x] Score moments by "interestingness"
- [x] Cap critical moments at ~25% of moves

### 4.4 Deep Analysis
- [x] For critical moments, run depth 20-24 analysis
- [x] Run MultiPV=3 for alternative lines
- [ ] Select meaningful alternatives (different plans, not just move order)
- [ ] Tag sidelines with purpose (tactical, strategic, simplifying)

### 4.5 Integration with Maia2
- [x] Fetch human-likeness for all moves using Maia2
- [x] Use Maia2 for rating estimation if metadata missing
- [x] Adjust classification thresholds based on estimated rating
- [ ] Identify "natural mistakes" vs "uncharacteristic errors"

### 4.6 Testing
- [x] Test classification on games with known blunders
- [x] Test critical moment detection
- [x] Verify rating-dependent thresholds work correctly
- [ ] Test with GM games and amateur games

---

## Milestone 5: Database & Opening Integration ✅

### 5.1 ECO Database
- [x] Source ECO opening classification data (Lichess chess-openings TSV)
- [x] Create SQLite database schema
- [x] Import ECO codes with names and main lines
- [x] Implement `getOpeningInfo(moves)` lookup via EcoClient

### 5.2 Lichess Elite Database
- [x] Download Lichess Elite database (2200+ games)
- [x] Design efficient schema for position lookup (FEN hashing)
- [x] Create indexes on opening moves and FEN hashes
- [x] Import games (loader script with configurable limit)

### 5.3 Reference Game Lookup
- [x] Implement `getReferenceGames(fen, limit)` query via LichessEliteClient
- [x] Return notable games reaching the position
- [x] Include player names, event, result, ELO
- [x] Optimize query performance with indexes

### 5.4 Opening Theory Detection
- [x] Detect where game leaves known theory (leftTheoryAtPly)
- [x] Track matched plies vs exact match
- [x] Integrate with analysis pipeline

### 5.5 Testing
- [x] Test ECO classification accuracy (42 unit tests)
- [x] Test reference game retrieval
- [x] Test FEN hashing and normalization
- [x] Test pipeline integration

---

## Milestone 6: LLM Annotation Generation

### 6.1 OpenAI Integration
- [ ] Set up OpenAI client
- [ ] Implement retry logic and error handling
- [ ] Track token usage
- [ ] Handle rate limiting

### 6.2 Prompt Engineering
- [ ] Design system prompt for chess annotation
- [ ] Create templates for different annotation types:
  - Opening commentary
  - Critical moment explanation
  - Sideline description
  - Game summary
- [ ] Include rating-awareness in prompts
- [ ] Prevent hallucination about games/openings

### 6.3 Annotation Planner
- [ ] For each critical moment, create structured annotation plan
- [ ] Include: position context, evals, themes, sidelines
- [ ] Determine verbosity level per position
- [ ] Chunk positions for efficient LLM batching

### 6.4 Comment Generation
- [ ] Generate natural language for each annotated position
- [ ] Include move explanations
- [ ] Explain why moves are good/bad at player's level
- [ ] Generate sideline descriptions

### 6.5 Game Summary
- [ ] Generate opening synopsis
- [ ] Generate "story of the game" overview
- [ ] Extract top 3 lessons for player's level
- [ ] Identify key novelty or critical mistake

### 6.6 Output Validation
- [ ] Validate LLM output structure
- [ ] Verify NAG codes are valid
- [ ] Check move references match actual game
- [ ] Handle LLM failures gracefully (fallback to basic annotations)

### 6.7 Testing
- [ ] Test prompt effectiveness on sample positions
- [ ] Test annotation quality on full games
- [ ] Test failure handling
- [ ] Measure token usage per game

---

## Milestone 7: PGN Renderer

### 7.1 Comment Insertion
- [ ] Insert `{comment}` blocks in correct positions
- [ ] Handle comment placement (before/after move)
- [ ] Escape special characters in comments
- [ ] Handle multi-line comments

### 7.2 NAG Insertion
- [ ] Insert NAG symbols ($1, $2, $4, $6, etc.)
- [ ] Map classification → NAG codes
- [ ] Handle multiple NAGs per move

### 7.3 Variation Rendering
- [ ] Render sidelines with parentheses `( ... )`
- [ ] Handle nested variations
- [ ] Maintain proper spacing and formatting
- [ ] Include comments in variations

### 7.4 Header Rendering
- [ ] Render all standard PGN tags
- [ ] Add summary as header comment
- [ ] Include analysis metadata tags (optional)

### 7.5 Validation
- [ ] Ensure output is valid PGN
- [ ] Test loading in common GUIs (Lichess, Chess.com, ChessBase)
- [ ] Handle edge cases (very long games, many variations)

### 7.6 Testing
- [ ] Round-trip tests (parse → render → parse)
- [ ] Test with various annotation densities
- [ ] Test GUI compatibility
- [ ] Validate against PGN specification

---

## Milestone 8: CLI & Orchestration

### 8.1 CLI Interface
- [ ] Implement `chessbeast analyze` command
- [ ] Support input file or stdin
- [ ] Support output file or stdout
- [ ] Implement config flags:
  - `--profile quick|standard|deep`
  - `--verbosity summary|normal|rich`
  - `--target-elo <number>`

### 8.2 Configuration
- [ ] Define config file format (JSON/YAML)
- [ ] Support environment variables for API keys
- [ ] Implement config validation
- [ ] Provide sensible defaults

### 8.3 Orchestrator
- [ ] Coordinate full analysis pipeline
- [ ] Manage service connections (Stockfish, Maia)
- [ ] Handle multi-game PGN input
- [ ] Implement progress reporting

### 8.4 Error Handling
- [ ] Handle service failures gracefully
- [ ] Implement fallback modes (no Maia, no LLM)
- [ ] Provide clear error messages
- [ ] Log errors for debugging

### 8.5 Performance
- [ ] Implement position caching
- [ ] Optimize service calls (batching where possible)
- [ ] Track and report timing
- [ ] Stay within compute budgets

### 8.6 Testing
- [ ] End-to-end tests with sample PGNs
- [ ] Test all CLI options
- [ ] Test error handling scenarios
- [ ] Benchmark performance

---

## Milestone 9: Testing & Quality Assurance

### 9.1 Integration Test Suite
- [ ] Full pipeline tests with GM games
- [ ] Full pipeline tests with amateur games
- [ ] Test various configurations
- [ ] Test edge cases (very short games, resignations, etc.)

### 9.2 Golden Tests
- [ ] Create curated input PGNs
- [ ] Generate approved annotated outputs
- [ ] Implement diff-based comparison
- [ ] Allow for minor LLM variation

### 9.3 Quality Validation
- [ ] Verify blunder detection accuracy (>90% agreement with engine)
- [ ] Check annotation coherence
- [ ] Validate opening identification
- [ ] Review sample outputs manually

### 9.4 Performance Benchmarks
- [ ] Measure time per game (quick/standard/deep profiles)
- [ ] Measure resource usage
- [ ] Test batch processing
- [ ] Identify bottlenecks

---

## Milestone 10: Documentation & Polish

### 10.1 User Documentation
- [ ] Write README with quick start
- [ ] Document all CLI options
- [ ] Provide example usage
- [ ] Document configuration options

### 10.2 Developer Documentation
- [ ] Document architecture
- [ ] Document data models
- [ ] Document service APIs
- [ ] Provide contribution guidelines

### 10.3 Setup Scripts
- [ ] Script to download Stockfish
- [ ] Script to download Maia models
- [ ] Script to download/setup Lichess database
- [ ] Provide all-in-one setup command

### 10.4 Final Polish
- [ ] Review and clean up code
- [ ] Ensure consistent error messages
- [ ] Add helpful CLI output (progress, statistics)
- [ ] Final testing pass

---

## Dependencies & Prerequisites

### External Software
- Stockfish binary (latest version)
- Python 3.10+
- Node.js 18+

### External Data
- Maia2 model (auto-downloaded via `pip install maia2`)
- ECO opening database
- Lichess Elite database (download from Lichess)

### API Keys
- OpenAI API key (for GPT-4o/GPT-5)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Maia2 model size | Maia2 auto-downloads models; single unified model simplifies deployment |
| LLM hallucinations | Strict prompts, provide only verified data, validate output |
| Database size | Use efficient indexing, consider caching common positions |
| gRPC complexity | Start with simple REST, migrate to gRPC if needed |
| Analysis time | Two-pass approach, budget management, caching |
