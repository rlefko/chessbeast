# Ultra-Fast CLI Chess Coach — Architecture (Review + Exploration + Post-Write)

> Design goal: **Game Review quality + deeper, human-like exploration**, while staying **fast enough** for CLI use now and a “power coach” later.

This document proposes an enhanced architecture that:
- prevents LLM context windows from ballooning,
- reduces repetitive exploration and over-commenting,
- leverages your **theme detection** as first-class signals,
- and makes engine + analysis **miles faster** via caching, staging, and transpositions.

---

## 0) Core principles

### A. Separate *facts* from *story*
Treat analysis as immutable, structured **artifacts** (engine evals, candidates, themes, deltas).  
Treat commentary as a **late rendering** step. This lets you:
- explore freely without “writing as you go,”
- dedupe ideas,
- control comment density,
- keep the exploration agent’s inputs compact and retrieval-based.

### B. Retrieval > growing context
Do **not** feed the exploration agent a concatenated history of position cards.  
Instead, store everything in a **Position Artifact Store** and feed the agent:
- the current node summary,
- the parent→child delta,
- a short “line memory” summary,
- and the **top-K relevant** artifacts retrieved by keys (themes, threats, last decision rationale).

### C. Stage computation by “need”
Compute cheap signals everywhere, expensive signals only when needed:
1. **Shallow**: fast eval + basic themes for all mainline positions.
2. **Standard**: deeper eval + standard themes for critical nodes.
3. **Full**: deep eval + full themes + forcing lines only for the small set of nodes worth it.

### D. Everything is keyed and cached
Any expensive result must be addressable by a stable key:
- **PositionKey**: Zobrist hash (preferred) + normalized FEN
- **AnalysisKey**: (PositionKey, depth, multipv, time, engineVersion, optionsHash)
- **ThemeKey**: (PositionKey, tier, detectorVersion)
- **NarrativeKey**: (NodeId, audience, verbosity, style, language)

---

## 1) High-level pipeline

```mermaid
flowchart TD
  A[PGN Ingest] --> B[Mainline Position Build]
  B --> C[Baseline Engine Pass (shallow)]
  C --> D[Move Assessment (NAG + criticality)]
  D --> E[Exploration Planner (priority queue)]
  E --> F[Exploration Workers (tree expansion)]
  F --> G[Artifact Store (positions, evals, themes, PVs)]
  G --> H[Post-Write Comment Synthesis]
  H --> I[Annotated PGN Renderer]
  H --> J[Optional: HTML/JSON Report]
```

### Where the speed comes from
- **Engine calls** are staged, cached, and deduped across transpositions.
- **Theme detection** is computed once per position (per tier), cached, and referenced later.
- **LLM usage** shifts from “per move commentary” to “post-write” + “planning decisions only”.

---

## 2) Data model (facts first)

### 2.1 Position + move graph

**VariationTree** is a DAG (not a pure tree) because of transpositions.

```ts
type PositionKey = string; // e.g., Zobrist64 hex, plus FEN for debugging

interface NodeId { id: string } // stable id for graph node

interface VariationNode {
  nodeId: NodeId;
  positionKey: PositionKey;
  ply: number;
  sideToMove: 'w'|'b';

  parentEdges: EdgeId[];     // allow transpositions
  childEdges: EdgeId[];

  // References (not duplicated data)
  artifactRefs: ArtifactRef[];    // evals, themes, PVs, candidates, etc.
  decisionRefs: DecisionRef[];    // planner/agent decisions
}

interface VariationEdge {
  edgeId: string;
  from: NodeId;
  to: NodeId;

  san: string;
  uci: string;

  // Assessment for THIS move (relative to parent)
  moveAssessmentRef: ArtifactRef;
}
```

### 2.2 Analysis artifacts (the “truth”)

```ts
interface EngineEvalArtifact {
  kind: 'engine_eval';
  positionKey: PositionKey;
  depth: number;
  multipv: number;

  cp?: number;               // centipawns from side-to-move perspective
  mate?: number;             // mate in N
  wdl?: [number, number, number]; // win/draw/loss in permille if available
  bestLinePVs: PVLine[];     // per PV: line moves + score
  engineVersion: string;
  optionsHash: string;
  createdAt: string;
}

interface HCEArtifact {
  kind: 'hce';
  positionKey: PositionKey;
  tier: 'shallow'|'standard'|'full';
  factors: Record<string, number>; // your SF16 HCE factors
  createdAt: string;
}

interface ThemeArtifact {
  kind: 'themes';
  positionKey: PositionKey;
  tier: 'shallow'|'standard'|'full';
  detected: DetectedTheme[]; // your schema
  detectorVersion: string;
  createdAt: string;
}

interface CandidateMovesArtifact {
  kind: 'candidates';
  positionKey: PositionKey;

  // Your union: Stockfish top-multiPV + Maia probability set
  candidates: CandidateMove[];
  selectionMeta: {
    sfDepth: number;
    sfMultipv: number;
    maiaModel: string;
    maiaTopN: number;
    maiaMinProb: number; // e.g., 0.10
  };
}

interface MoveAssessmentArtifact {
  kind: 'move_assessment';
  parentPositionKey: PositionKey;
  moveUci: string;
  childPositionKey: PositionKey;

  winProbDelta: number;      // from your wdl/win-prob model
  cpDelta: number;
  nag: string;               // e.g., "?", "!!", "!?"
  tags: string[];            // e.g., ["blunder", "tactical", "inaccuracy"]
  severity: 'critical'|'significant'|'minor';
}
```

### 2.3 Theme lifecycle (prevents repetition)

Themes should not be “re-explained” every ply. Track lifecycle per explored line:

```ts
interface ThemeInstance {
  themeId: string;
  beneficiary: 'w'|'b';
  primarySquare?: string;

  firstSeenPly: number;
  lastSeenPly: number;

  status: 'emerged'|'persisting'|'escalated'|'resolved'|'transformed';
  noveltyScore: number; // high when newly relevant or changes materially
}
```

**Theme delta** is what you feed to the agent / writer:
- emerged: “new idea appears”
- escalated: severity/confidence/material at stake increases
- resolved: idea no longer relevant
- transformed: e.g., pin becomes skewer, weakness becomes tactic

---

## 3) “Fast-first” computation strategy

### 3.1 Baseline pass (mainline only)
For each mainline position:
- **Engine shallow eval** (low depth or tight movetime)
- **Shallow theme tier**
- **HCE shallow/standard** (depending on cost)
- compute **win probability** and **delta** per move
- assign **NAG** and **criticality score**

This pass is what makes the tool feel instant.

### 3.2 Criticality score (drives everything)
Instead of “NAG only,” use a richer scalar `criticality`:

```
criticality =
  a * |winProbDelta|
+ b * |cpDelta|
+ c * tactical_volatility
+ d * theme_novelty
+ e * king_safety_risk
+ f * branching_uncertainty
- g * repetition_penalty
```

Recommended fast components:
- `tactical_volatility`: abs(shallowEval - deeperEval) if available, else “checks/captures/threat count”
- `theme_novelty`: based on ThemeInstance transitions (emerged/escalated)
- `branching_uncertainty`: how close top candidates are (eval spread)
- `repetition_penalty`: identical motif repeated in nearby plies

Use `criticality` to decide:
- which nodes get deeper engine analysis,
- which nodes merit exploration,
- and which nodes deserve commentary density.

### 3.3 Adaptive multipv
Multipv is expensive. Use it only when it buys you something:
- **Low multipv** in quiet positions with large eval gaps.
- **Higher multipv** when eval spread is tight, tactics are present, or maia disagreement is high.

Heuristic:
- if `evalSpread(top1-top2) < 0.25` or themes include forcing motifs ⇒ raise multipv.

### 3.4 “Deepen only the frontier”
Exploration expands a frontier. Deepen engine only for:
- the current frontier node,
- and the candidate children being compared.

Everything else stays shallow unless later promoted by the planner.

---

## 4) Exploration architecture (planner + workers + memory)

### 4.1 Split “chooser” from “writer”
Use small models (or pure heuristics) for choosing what to explore; use larger models only for final narration.

- **Exploration Planner** (cheap):
  - input: node summary + candidates + deltas
  - output: next expansions + budgets + stopping decisions

- **Exploration Worker** (mostly deterministic):
  - runs engine on candidate moves (with cache)
  - runs theme detectors on new positions (with cache)
  - updates graph + artifacts

- **Optional LLM** only when:
  - there’s genuine ambiguity among close candidates,
  - or you need human-like “why this line matters” to rank exploration.

### 4.2 Priority-queue best-first search (fast & human-like)
Maintain a priority queue of nodes to expand:

```
priority(node) =
  w1*criticality(node)
+ w2*expected_information_gain(node)
+ w3*novelty_vs_existing_lines(node)
- w4*cost_estimate(node)
```

- **expected_information_gain**: prefer lines where candidates are close and motifs are unclear.
- **novelty_vs_existing_lines**: avoid exploring the same idea twice.
- **cost_estimate**: derived from branching factor and whether full-tier detectors are needed.

### 4.3 Transposition awareness (huge speed win)
Before evaluating a child, compute its `positionKey`. If already analyzed at sufficient depth:
- reuse evals, themes, PVs,
- attach edge to existing node,
- skip duplicate exploration unless the *line memory* indicates a different narrative need.

### 4.4 Line memory (compact, retrieval-friendly)
Instead of sending old FENs/cards, keep a running summary per explored path:

```ts
interface LineMemory {
  lineId: string;
  rootNode: NodeId;
  currentNode: NodeId;

  // 5–15 bullet facts, always short
  rollingSummary: string[];

  // active motifs tracked via ThemeInstances
  activeThemes: ThemeInstance[];

  // “what we’ve already explained”
  explainedThemeKeys: Set<string>; // (themeId + square + beneficiary)
  explainedConceptKeys: Set<string>; // e.g., "minority_attack", "open_file_pressure"

  // for exploration redundancy prevention
  exploredIdeaKeys: Set<string>; // hashed motif clusters
}
```

**Update rule per move**: only add to `rollingSummary` if something changes materially:
- eval swing
- theme delta with high novelty
- structural change (pawn break, king exposure)
- plan shift (best move changes from quiet to forcing)

---

## 5) Position cards (human + LLM) without overload

### 5.1 Two-tier cards: “agent card” vs “human card”
**Agent Card** must be tiny and delta-oriented; **Human Card** can be richer.

#### Agent Card (what the planner/LLM sees)
- FEN (or hash + optional FEN on demand)
- eval + wdl + trend vs parent
- NAG + criticality
- **Theme deltas only** (emerged/escalated/resolved) capped (e.g., max 5)
- top candidate moves (max 6) with:
  - eval delta vs best
  - tactical flag (check/capture/threat)
  - one-liner reason label from detectors/templates
- “already-explained” keys (short list)

#### Human Card (what CLI prints)
- full theme list, but grouped + capped:
  - show only critical/significant by default
  - allow `--show-themes=all` to dump everything
- PV lines and alternative lines
- HCE factors (but summarized: top 3 positive/negative contributors)

### 5.2 Theme grouping and capping
To avoid overload:
- group by **beneficiary + category**
- keep only top-N per group by (severity, confidence, materialAtStake)
- show “(+k more)” with an expansion flag in interactive mode

Example rendering:

- **Tactics (White)**: absolute pin (critical), discovered attack (significant) (+2 more)
- **Structure (Black)**: isolated pawn d5 (significant), weak square e4 (minor)

---

## 6) Post-write comment synthesis (solves over-commenting)

### 6.1 Why post-write is the right move
Exploration needs freedom and speed; writing needs cohesion and restraint.

So:
1. Exploration builds a **fact graph** (nodes, evals, themes, PVs, decisions).
2. Post-write turns facts into comments with:
   - redundancy elimination,
   - consistent terminology,
   - intentional comment density.

### 6.2 Comment planning: “what deserves a comment?”
Create **CommentIntents** from artifacts:

- “Why this move?” (critical NAG or plan shift)
- “What was missed?” (best line vs played line delta)
- “Tactical shot” (forcing sequence, mate threats)
- “Strategic plan” (pawn break available, outpost, open file)
- “Endgame technique” (opposition, triangulation, zugzwang)
- “Human move” (Maia likes it vs engine dislikes it; explain)

Each intent gets a score:

```
intentScore =
  α*criticality
+ β*theme_novelty
+ γ*instructional_value
- δ*redundancy_with_nearby_comments
```

Then enforce density rules:
- at most 1–2 comments per 3 plies by default,
- always comment on blunders/turning points,
- compress repeated plans into a single “umbrella” comment.

### 6.3 Redundancy elimination via “idea keys”
Generate stable idea keys (hashes) from:
- theme IDs + primary squares + beneficiary
- structural features (isolated pawn on d-file, open file on e-file)
- tactical signatures (check patterns, pinned piece id)

If an idea key already explained in this line segment, downgrade the comment or skip.

---

## 7) LLM integration: fast, bounded, and reliable

### 7.1 Use LLMs in three narrow roles
1. **Exploration tie-breaker** (rare): “which candidate is more interesting to explore and why?”
2. **Post-write narrator** (main use): generate compact, high-quality comments from structured facts.
3. **Didactic reframer** (optional): “explain like I’m 1200/1800/2000”.

Everything else should be deterministic or engine-driven.

### 7.2 Retrieval-driven prompts (no giant context)
LLM inputs should be JSON + small snippets:

```json
{
  "node": { "fen": "...", "eval": "+0.42", "wdl": [410, 320, 270], "nag": "!?" },
  "move": { "played": "Re1", "best": "c4" },
  "themeDeltas": [
    {"id":"outpost","status":"emerged","squares":["e5"],"beneficiary":"w","severity":"significant"}
  ],
  "pv": { "bestLine": ["c4","dxc4","Bxc4"] },
  "lineMemory": {
    "rollingSummary": ["White has space advantage on kingside", "Black's d-pawn is weak"],
    "explainedIdeaKeys": ["isolated_pawn:d5:b", "open_file:e:w"]
  },
  "output": { "maxWords": 55, "style": "coach", "audience": "club" }
}
```

This keeps calls cheap and prevents drift.

### 7.3 Deterministic explanation skeletons
For each detector theme, maintain a templated explanation skeleton:

- `absolute_pin`: “{piece} is pinned to the king along {ray}; moving it is illegal.”
- `outpost`: “{square} is a stable outpost: supported by pawns and hard to challenge with pawns.”

Let the LLM only do:
- phrasing,
- prioritization,
- and light connective tissue.

---

## 8) Engine + compute performance plan (what makes it *miles faster*)

### 8.1 Caching layers (the big wins)
1. **Position cache**: `positionKey → {fen, bitboards, moveGenCache}`
2. **Engine cache**: `(positionKey, depth/movetime, multipv, engineVersion, optionsHash) → eval artifact`
3. **Theme cache**: `(positionKey, tier, detectorVersion) → theme artifact`
4. **Candidate cache**: `(positionKey, policyVersion) → candidate list`
5. **Render cache**: `(nodeId, verbosity, style) → comment text`

Store on disk (SQLite/LMDB) + in-memory LRU.

### 8.2 Multi-process Stockfish pool
One Stockfish instance cannot analyze multiple positions simultaneously. Use a pool:
- N workers = min(physical cores, configured max)
- each worker keeps a warm engine process
- jobs are queued; results cached

### 8.3 Iterative deepening + promotion
Compute low depth everywhere, then “promote” a node when it matters:
- criticality crosses threshold,
- planner requests it,
- or a tactical theme emerges.

### 8.4 Avoid full FEN churn
For internal keys, rely on:
- Zobrist hash
- and compact board representation
Keep FEN only for debugging and output.

### 8.5 Detector performance
Use bitboards and incremental updates where possible:
- pins/skewers/x-ray: ray attacks via precomputed masks
- pawn structure: file counts + pawn bitboards
- outposts/holes: pawn attacks bitboards
Most detectors can run in microseconds with bitboards.

---

## 9) Output architecture (annotated PGN + optional rich formats)

### 9.1 “Annotated PGN Builder”
Build PGN by attaching:
- NAGs per move,
- comments at selected nodes,
- variations/sub-variations from explored edges,
- and references to key lines (best line, refutation line, human line).

### 9.2 Variation selection for PGN
Do not dump the entire explored DAG. Choose lines by:
- highest instructional value,
- coverage of distinct ideas (idea keys),
- and proximity to critical moments.

Default:
- at most 1–2 variations per critical node
- at most depth D (e.g., 6–12 plies) unless forced line (mate/tactic)

### 9.3 Alternate outputs (optional but future-proof)
- `analysis.json`: full artifacts + graph for debugging and UI
- `report.html`: human-friendly “Game Review++”
- `positions.ndjson`: streaming-friendly, easy to index

---

## 10) Suggested module layout (TypeScript)

```
src/
  cli/
    main.ts
    commands/
      analyze.ts
      explore.ts
      render.ts
  pgn/
    parse.ts
    san.ts
    annotate.ts
  chess/
    board.ts              // bitboards, zobrist, movegen
    fen.ts
    zobrist.ts
  engine/
    stockfishPool.ts
    evalCache.ts
    wdl.ts
    candidates.ts         // SF + Maia union, policy controls
  themes/
    detectors/
      pin-detector.ts
      fork-detector.ts
      ...
    themeCache.ts
    lifecycle.ts          // ThemeInstance tracking + deltas
  analysis/
    baselinePass.ts
    criticality.ts
    moveAssessment.ts
  exploration/
    planner.ts            // PQ best-first, budgets, novelty control
    worker.ts             // expand node, attach artifacts, handle transpositions
    lineMemory.ts
  narration/
    intents.ts
    redundancy.ts
    postWrite.ts
    llm/
      client.ts
      promptSchemas.ts
      templates.ts
  storage/
    sqlite.ts             // or lmdb
    models.ts
  render/
    pgnRenderer.ts
    textReport.ts
    htmlReport.ts
tests/
  golden/
  unit/
  perf/
```

---

## 11) Concrete “anti-overload” rules (defaults that work)

### 11.1 For the agent
- never show more than **6 candidates**
- never show more than **5 theme deltas**
- never show full HCE; show only “top 2 pros / top 2 cons”
- include only a **rolling summary** capped at ~10 bullets

### 11.2 For humans (CLI)
- show **critical/significant themes only**
- collapse groups with “(+k more)”
- comments: cap at **~50–80 words** each by default

### 11.3 For exploration redundancy
- do not expand a node if its `positionKey` has already been expanded with:
  - same active idea keys,
  - and similar eval band (within epsilon),
  - unless the line has different “decision context” (e.g., different move order matters)

---

## 12) Practical default budgets (fast CLI)

- Baseline mainline:
  - SF shallow: depth 10–12 (or 30–80ms/move depending on hardware)
  - multipv 1–2
  - shallow themes only

- Critical nodes:
  - SF standard: depth 16–18
  - multipv 3–5 (adaptive)
  - standard themes

- Deep tactics / forcing:
  - SF full: depth 20–24 or time-limited burst
  - multipv 5–8 only when justified
  - full themes + forcing detectors

Exploration stopping conditions:
- queue empty or below minimum priority
- eval becomes stable and no new motifs
- variation refuted quickly (clear best response)
- reached configured ply limit

---

## 13) Implementation roadmap (incremental, high ROI)

### Phase 1 — Speed foundations (biggest wins first)
- PositionKey via zobrist + normalized FEN
- Disk + memory cache for engine evals and themes
- Stockfish worker pool
- DAG with transpositions

### Phase 2 — Context + redundancy control
- LineMemory + rolling summaries
- Theme lifecycle + theme deltas
- Idea keys + exploration redundancy penalties

### Phase 3 — Post-write narration
- CommentIntents generation
- Density control + redundancy elimination
- LLM narration with JSON schema + template skeletons

### Phase 4 — Quality upgrades
- Adaptive multipv/depth
- Expected information gain heuristics
- Maia-vs-engine “human move” explanations

---

## 14) What this architecture fixes (mapped to your concerns)

### “Context window rapidly growing”
✅ Replace concatenated cards with **Artifact Store + retrieval**, and feed only deltas + rolling summary.

### “Information overload from multiple themes”
✅ Show **theme deltas** to the agent; show grouped/capped themes to humans; keep full list stored.

### “Over-commenting”
✅ Move writing to **post-write synthesis** with intent scoring, redundancy elimination, and density rules.

### “Exploration repeats the same idea”
✅ Use **Theme lifecycle + idea keys + transposition-aware DAG** to detect already-explored motifs.

### “Needs to be miles faster”
✅ Caching + staging + engine pool + transpositions + adaptive multipv is the speed core.

---

## Appendix A — Minimal Agent Card (example)

```yaml
position:
  key: 0x9a1c...e4
  fen: "r1bq1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2P2N2/PP3PPP/RNBQ1RK1 w - - 0 7"
  eval: +0.35
  wdl: [410, 330, 260]
  nag: "!?"
  criticality: 0.72

delta_from_parent:
  eval_delta: -0.58
  winprob_delta: -0.12

theme_deltas:
  - id: "relative_pin"
    status: "emerged"
    beneficiary: "b"
    severity: "significant"
    squares: ["f3"]
  - id: "pawn_break_available"
    status: "emerged"
    beneficiary: "w"
    severity: "significant"
    squares: ["c4"]

candidates:
  - move: "c4"
    eval: +0.52
    tags: ["pawn_break", "space"]
  - move: "Re1"
    eval: +0.33
    tags: ["quiet", "development"]
  - move: "dxe5"
    eval: +0.10
    tags: ["capture", "simplify"]

line_memory:
  summary:
    - "White has slight space advantage."
    - "Black targets the e4 pawn."
  explained_ideas:
    - "isolated_pawn:d5:b"
    - "open_file:e:w"
```

---

## Appendix B — “Idea key” examples

- `relative_pin:f3:b`  
- `outpost:e5:w`  
- `open_file:e:w`  
- `pawn_break:c4:w`  
- `back_rank_weakness:g8:b`

Idea keys are used for:
- exploration novelty scoring,
- redundancy elimination in comments,
- and variation selection for PGN.

---

## Appendix C — Rendering policy knobs (CLI flags)
Suggested flags:
- `--speed=fast|normal|deep`
- `--themes=none|important|all`
- `--variations=low|medium|high`
- `--comment-density=sparse|normal|verbose`
- `--audience=beginner|club|expert`
- `--engine-threads=N --engine-hash=MB`
- `--cache-dir=... --no-cache`

---

### End
This architecture keeps the exploration smart and fast by making **analysis structured and cached**, using **retrieval-based memory**, and moving writing into a **post-write synthesis** step that can deliberately control density and redundancy.
