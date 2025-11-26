PRD: AI Chess Annotator

1. Overview

Product name (working): ExplainChess

ExplainChess is a chess analysis tool that takes a PGN as input and returns a fully annotated PGN as output. It combines:
	•	Stockfish (optimal play, precise evaluation)
	•	Maia Chess (human-like move prediction by rating)
	•	LLMs (natural language and pedagogical explanations)
	•	Game databases (opening theory, master & amateur reference games)

The goal is to deliver annotations that feel like a strong human coach: not just "+1.5, better was 21.Nf5", but why, what each side is trying to do, and what would have been reasonable at the players' level.

⸻

1.1 Technology Decisions

The following technology choices have been made for v1:

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Architecture | Hybrid (TypeScript + Python) | Best of both worlds: TypeScript for CLI/API, Python for ML |
| CLI & Orchestration | TypeScript / Node.js | Modern async, good DX, familiar ecosystem |
| ML Services | Python + gRPC | Native Maia/Stockfish support, efficient binary protocol |
| LLM Provider | OpenAI GPT-4o (upgradeable to GPT-5) | Strong performance, good API |
| Database | SQLite | Simple local storage, no external dependencies |
| Deployment Target | Local CLI | Simplicity for v1; cloud deployment deferred |

⸻

2. Goals & Non‑Goals

2.1 Goals
	1.	Explain games in human terms
	•	Provide instructive, coherent commentary throughout the game.
	•	Highlight plans, ideas, and turning points, not just engine evals.
	2.	Be rating‑aware
	•	Adapt criticism, suggested moves, and depth of explanation to each player’s estimated strength (via metadata or Maia-based estimation).
	3.	Balance depth vs. relevance
	•	Decide which positions deserve deep analysis.
	•	Limit sidelines and engine spam; prioritize humanly relevant lines.
	4.	Leverage theory and history
	•	Identify the opening, ECO code, and main line.
	•	Reference notable master games and typical amateur patterns.
	5.	Produce standard‑compliant annotated PGN
	•	Legal PGN with comments, NAGs, and sidelines that can be loaded into common GUIs.
	6.	Integrate Maia for human-likeness analysis (Core Requirement)
	•	Use Maia models to predict human-like moves at various rating levels.
	•	Estimate player ratings from move patterns when not provided.
	•	Distinguish "natural mistakes" from "uncharacteristic errors".

2.2 Non‑Goals
	•	Real‑time integration with online games (no "live game analysis").
	•	Full GUI client (initially: CLI + API; GUIs are separate projects).
	•	Support for exotic variants (e.g., Chess960, crazyhouse); focus on standard chess.
	•	Generating video or rich media directly (can be built on top of this API).
	•	Cloud-hosted API service (v1 is local CLI only; cloud deployment deferred to future versions).

⸻

3. Target Users & Personas
	1.	Improving Amateur (1200–2000 Elo) “Alex”
	•	Uploads games after online sessions.
	•	Wants to understand critical mistakes and missed chances, not just engine lines.
	2.	Coach / Trainer “Dana”
	•	Analyzes students’ games in batches.
	•	Needs instructive, rating-appropriate annotations to use as lesson material.
	3.	Content Creator “Sam”
	•	Uses the tool to bootstrap commentary for blog posts, newsletters, or videos.
	4.	Developer / Platform “Lena”
	•	Integrates the analysis API into an existing chess app or website.

⸻

4. User Stories
	•	As Alex, I want to upload a PGN and get back a version with commentary so I can read through my game like a lesson.
	•	As Dana, I want configurable depth and verbosity so I can quickly scan a student’s key mistakes with suggested training themes.
	•	As Sam, I want clear, coherent paragraphs of commentary and variations that I can edit and reuse.
	•	As Lena, I want a simple API analyze_pgn(pgn, config) that returns a valid annotated PGN.

⸻

5. Functional Requirements

5.1 Input & Configuration
	•	FR1: Accept PGN as raw text (single or multiple games).
	•	FR2: Support optional metadata:
	•	Player ratings and names.
	•	Time control.
	•	Desired analysis profile (e.g., quick, standard, deep).
	•	Desired verbosity (summary, normal, rich).
	•	Target audience rating (if different from players).
	•	FR3: Validate PGN and return structured errors for:
	•	Illegal moves.
	•	Incomplete or malformed tags.
	•	Unsupported variants.

5.2 Core Analysis Pipeline
	•	FR4: Parse PGN into:
	•	Move list.
	•	Per-move positions (FEN).
	•	Game metadata (event, players, ratings).
	•	FR5: Estimate player strength if ratings not provided:
	•	Use Maia / model-based estimation from behavior over the game.
	•	FR6: Run engine analysis:
	•	Quick pass for all moves (low depth) to get evaluation + best move.
	•	Deeper analysis only for selected key positions.
	•	FR7: Classify move quality per player rating:
	•	Categories: book, excellent, good, inaccuracy, mistake, blunder, forced, only move, brilliant (if applicable).
	•	Use centipawn loss thresholds that depend on estimated rating.
	•	FR8: Detect critical moments:
	•	Large evaluation swings.
	•	Missed tactics (win to draw, draw to loss, etc.).
	•	Transition points (opening–middlegame, middlegame–endgame).
	•	FR9: Integrate Maia/human-likeness:
	•	For key positions, compute how “human” a move is at the player’s level.
	•	Identify “natural but flawed” vs. “non-obvious engine move”.
	•	FR10: Opening theory and database:
	•	Identify opening name and ECO code.
	•	Show where the game left main theory.
	•	Optionally reference notable master games and common amateur motifs from a database.
	•	FR11: Sidelines selection:
	•	For each critical position, include up to N main alternatives (N configurable, default 2–3).
	•	Ensure sidelines are reasonably short and thematically focused.
	•	FR12: LLM commentary:
	•	Generate natural-language explanations describing:
	•	Plans and ideas.
	•	Why a move was good/bad at that level.
	•	How the game could have gone in main sidelines.
	•	The story arc of the game (opening, middlegame plans, endgame technique).

5.3 Output
	•	FR13: Return a valid, standards-compliant annotated PGN:
	•	Insert comments {...} before or after moves.
	•	Insert NAG glyphs like $1, $2, $4, $6, $18, etc.
	•	Add variations using parentheses ( ... ).
	•	FR14: Provide a summary block (can be PGN comments at start) including:
	•	Game overview (who was better, where it turned).
	•	Top 3 lessons for the user’s level.
	•	Opening synopsis and key novelty/mistake.
	•	FR15: Expose machine-readable metadata (in parallel to PGN string) via API:
	•	Per-move evaluation and classification.
	•	List of critical moments.
	•	Opening information and reference game IDs (if any).

⸻

6. Non‑Functional Requirements
	•	NFR1: Performance
	•	“Standard” profile: one classical-length game (40–60 moves) analyzed in a reasonable time on a typical server (details left implementation-specific, but pipeline must support concurrency and time-bounded analysis).
	•	NFR2: Scalability
	•	Support batch analysis of many games via API without manual intervention.
	•	NFR3: Reliability
	•	Must always produce syntactically valid PGN or a clear error.
	•	Handle engine and LLM failures gracefully with fallbacks.
	•	NFR4: Consistency
	•	Re-running analysis with the same config should produce largely stable output (within stochastic limits of LLM).
	•	NFR5: Safety & Accuracy
	•	Avoid fabricating non-existent historical games or false opening names.
	•	Prefer “I don’t know” style wording where external data is uncertain.

⸻

7. Success Metrics
	•	User satisfaction (e.g., >80% “helpful” rating from beta testers).
	•	Engagement:
	•	Average time spent reading annotated games.
	•	Return usage: % of users who analyze more than 5 games.
	•	Educational value:
	•	Blind testing: users improve blunder rate in subsequent games after reading analyses.
	•	Quality vs engine:
	•	Move classifications correlate with engine-based ground truth (e.g., >90% agreement on blunders/mistakes).

⸻

8. Risks & Mitigations
	•	Risk: LLM hallucinations about specific games or openings.
	•	Mitigation: Explicitly provide only verified DB info to the LLM; add guardrails and fact-check templates.
	•	Risk: High compute cost (deep engine + LLM for many positions).
	•	Mitigation: Two-pass analysis (shallow for all, deep for few), configurable depth, caching.
	•	Risk: Poor relevance (wall of engine lines nobody can use).
	•	Mitigation: Strong heuristics for critical positions; human-likeness signal from Maia; user feedback loop.

⸻

9. Out of Scope (for v1)
	•	Multi-language commentary (initially one language, likely English).
	•	GUI board viewer.
	•	Online integration with major chess servers (can be added via API later).

⸻
