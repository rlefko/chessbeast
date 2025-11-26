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
- [ ] Generate TypeScript client stubs
- [x] Generate Python server stubs
- [ ] Create basic connectivity test

### 0.5 Development Environment
- [x] Create `docker-compose.yml` for local services
- [x] Document local setup requirements (Stockfish binary, Maia models)
- [x] Create scripts for running services locally (Makefile)

---

## Milestone 1: PGN Parser & Chess Core (TypeScript)

### 1.1 PGN Parser
- [ ] Implement PGN tag parser (Event, White, Black, Result, etc.)
- [ ] Implement move text parser (SAN notation)
- [ ] Handle existing comments and variations in input PGN
- [ ] Parse NAG symbols ($1, $2, etc.)
- [ ] Implement robust error handling with position info

### 1.2 Chess Position Model
- [ ] Implement `Position` class (board state, castling rights, en passant)
- [ ] Implement FEN serialization/deserialization
- [ ] Implement move application (SAN → position update)
- [ ] Validate move legality
- [ ] Generate FEN for each position in game

### 1.3 Game Model
- [ ] Define `GameMetadata` type
- [ ] Define `MoveInfo` type with fenBefore/fenAfter
- [ ] Define `ParsedGame` combining metadata + moves
- [ ] Implement multi-game PGN parsing

### 1.4 Unit Tests
- [ ] Test PGN parsing with various formats
- [ ] Test illegal move detection
- [ ] Test FEN generation accuracy
- [ ] Test edge cases (promotions, castling, en passant)
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

## Milestone 3: Maia Service (Python + gRPC)

### 3.1 Model Loading
- [ ] Download Maia model weights (1100-1900 rating bands)
- [ ] Implement model loading/caching
- [ ] Support loading specific rating band model
- [ ] Support loading multiple models for ensemble

### 3.2 Move Prediction API
- [ ] Implement `predictMoves(fen, ratingBand)` method
- [ ] Return top moves with probabilities
- [ ] Handle all legal positions
- [ ] Optimize batch prediction if needed

### 3.3 Rating Estimation
- [ ] Implement `estimateRating(moves[])` method
- [ ] Compare played moves against predictions across rating bands
- [ ] Return estimated rating range
- [ ] Handle short games gracefully

### 3.4 Human-Likeness Scoring
- [ ] For a position + played move, return P(human plays this)
- [ ] Implement for each rating band
- [ ] Define "natural but flawed" vs "engine-like" classification

### 3.5 gRPC Service
- [ ] Implement `MaiaService` gRPC server
- [ ] Define request/response messages
- [ ] Add health check endpoint
- [ ] Handle model loading on startup

### 3.6 Testing
- [ ] Test predictions against known positions
- [ ] Test rating estimation accuracy
- [ ] Test service under load
- [ ] Validate probability distributions

---

## Milestone 4: Basic Analysis Pipeline (TypeScript)

### 4.1 Two-Pass Engine Analysis
- [ ] Implement shallow pass (depth 12-16) for all positions
- [ ] Track evaluation for each position
- [ ] Calculate centipawn loss per move
- [ ] Store results in `MoveAnalysis` structure

### 4.2 Move Classification
- [ ] Implement rating-dependent thresholds
- [ ] Classify moves: book, excellent, good, inaccuracy, mistake, blunder
- [ ] Detect "forced" moves (only one reasonable option)
- [ ] Detect "brilliant" moves (low Maia prob, high engine eval, sacrifice)

### 4.3 Critical Moment Detection
- [ ] Detect large evaluation swings
- [ ] Detect game-result transitions (win→draw, etc.)
- [ ] Detect phase transitions (opening→middlegame→endgame)
- [ ] Score moments by "interestingness"
- [ ] Cap critical moments at ~25% of moves

### 4.4 Deep Analysis
- [ ] For critical moments, run depth 20-24 analysis
- [ ] Run MultiPV=3 for alternative lines
- [ ] Select meaningful alternatives (different plans, not just move order)
- [ ] Tag sidelines with purpose (tactical, strategic, simplifying)

### 4.5 Integration with Maia
- [ ] Fetch human-likeness for all moves
- [ ] Use Maia for rating estimation if metadata missing
- [ ] Adjust classification thresholds based on estimated rating
- [ ] Identify "natural mistakes" vs "uncharacteristic errors"

### 4.6 Testing
- [ ] Test classification on games with known blunders
- [ ] Test critical moment detection
- [ ] Verify rating-dependent thresholds work correctly
- [ ] Test with GM games and amateur games

---

## Milestone 5: Database & Opening Integration

### 5.1 ECO Database
- [ ] Source ECO opening classification data
- [ ] Create SQLite database schema
- [ ] Import ECO codes with names and main lines
- [ ] Implement `getOpeningInfo(moves)` lookup

### 5.2 Lichess Elite Database
- [ ] Download Lichess Elite database (2200+ games)
- [ ] Design efficient schema for position lookup
- [ ] Create indexes on opening moves and FEN hashes
- [ ] Import games (will take time, ~2M records)

### 5.3 Reference Game Lookup
- [ ] Implement `getReferenceGames(fen, limit)` query
- [ ] Return notable games reaching the position
- [ ] Include player names, event, result
- [ ] Optimize query performance

### 5.4 Opening Theory Detection
- [ ] Detect where game leaves known theory
- [ ] Identify novelties vs known deviations
- [ ] Flag "mainline" vs "sideline" openings

### 5.5 Testing
- [ ] Test ECO classification accuracy
- [ ] Test reference game retrieval
- [ ] Test performance with large database
- [ ] Verify opening detection on known games

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
- Maia model weights (~100MB per rating band)
- ECO opening database
- Lichess Elite database (download from Lichess)

### API Keys
- OpenAI API key (for GPT-4o/GPT-5)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Maia model complexity | Start with single rating band, add others incrementally |
| LLM hallucinations | Strict prompts, provide only verified data, validate output |
| Database size | Use efficient indexing, consider caching common positions |
| gRPC complexity | Start with simple REST, migrate to gRPC if needed |
| Analysis time | Two-pass approach, budget management, caching |
