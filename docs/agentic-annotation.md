# Agentic Annotation Mode

Agentic annotation uses an LLM with tool-calling capabilities to explore chess variations. The LLM navigates a tree structure, adding alternatives and annotations as it explores.

## CLI Usage

```bash
# Basic agentic annotation
chessbeast analyze --input game.pgn --output annotated.pgn --agentic

# With all moves (not just critical moments)
chessbeast analyze --input game.pgn --output annotated.pgn --agentic --agentic-all

# Show cost summary
chessbeast analyze --input game.pgn --output annotated.pgn --agentic --show-costs

# Custom tool limits
chessbeast analyze --input game.pgn --output annotated.pgn --agentic \
  --exploration-max-tool-calls 60 \
  --exploration-max-depth 30
```

## Architecture

### Tree-Based Exploration

The system uses a tree structure where:

- **Root**: Position before the analyzed move
- **Nodes**: Each move is a node with metadata (comment, NAGs, engine eval)
- **Children**: Alternative continuations from a position
- **Principal child**: Marked as the "main line" continuation

### Key Components

| File                     | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `agentic-explorer.ts`    | Main explorer class, LLM loop, tool execution |
| `variation-tree.ts`      | Tree data structure and navigation            |
| `exploration-tools.ts`   | Tool definitions for OpenAI function calling  |
| `stopping-heuristics.ts` | Budget management and continuation assessment |

## How It Works

### 1. Tree Initialization

When exploring a move (e.g., `12. Qe2` classified as inaccuracy):

```
Root = position BEFORE 12. Qe2
  └── Qe2 (played move) ← LLM starts here
```

The LLM starts AT the played move, not before it. This allows immediate use of `add_alternative`.

### 2. LLM Workflow

The LLM receives:

```
YOU ARE AT: Qe2 (inaccuracy)

[Board visualization]

FEN: r1bq1rk1/...

This was slightly inaccurate. Show the stronger option:
1. add_alternative(betterMove)
2. go_to and explore briefly
3. annotate the key difference

Start with evaluate_position to see the best moves.
```

### 3. Tool Calling

The LLM uses tools to navigate and annotate:

```
1. evaluate_position      → Engine says Re1 is best
2. add_alternative("Re1") → Creates sibling: Root → Qe2, Root → Re1
3. go_to(<Re1_fen>)       → Navigate to Re1 position
4. annotate("activates rook")
5. add_move("Nd7")        → Continue line: Re1 → Nd7
6. add_move("Ne5")        → Continue: Nd7 → Ne5
7. annotate("strong outpost")
8. finish_exploration("showed Re1 improvement")
```

### 4. PGN Generation

The tree converts to PGN:

```
12. Qe2 (12. Re1 {activates rook} Nd7 13. Ne5 {strong outpost})
```

## Available Tools

### Navigation

| Tool                   | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `get_position`         | Get current node info (FEN, children, parent)     |
| `add_move(san)`        | Play a move, creating child node. You move to it. |
| `add_alternative(san)` | Add sibling move. You stay at current position.   |
| `go_to(fen)`           | Jump to position by FEN                           |
| `go_to_parent`         | Move up one level                                 |
| `get_tree`             | ASCII visualization of entire tree                |

### Annotation

| Tool                    | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `set_comment(comment)`  | Set/replace comment on current node (2-8 words)                      |
| `get_comment`           | Get current comment                                                  |
| `add_move_nag(nag)`     | Add move quality NAG ($1-$6). Use freely.                            |
| `set_position_nag(nag)` | Set position evaluation NAG ($10-$19). **ONLY at END of variation!** |
| `get_nags`              | Get all NAGs on current node                                         |
| `clear_nags`            | Remove all NAGs                                                      |
| `set_principal(san)`    | Mark child as main continuation                                      |

### Work Queue

| Tool                      | Description                      |
| ------------------------- | -------------------------------- |
| `mark_interesting(moves)` | Note moves to explore later      |
| `get_interesting`         | Get unexplored interesting moves |
| `clear_interesting(move)` | Remove from list after exploring |

### Analysis

| Tool                         | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `get_candidate_moves(count)` | Get top N engine moves for side to move. **USE FIRST!** |
| `evaluate_position`          | Engine evaluation (cached)                              |
| `predict_human_moves`        | Maia predictions for target rating                      |
| `lookup_opening`             | Opening name and theory                                 |
| `find_reference_games`       | Master games from position                              |

### Control

| Tool                  | Description                  |
| --------------------- | ---------------------------- |
| `assess_continuation` | Should exploration continue? |
| `finish_exploration`  | Signal completion            |

### Sub-Exploration

| Tool                                         | Description                                                         |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `mark_for_sub_exploration(reason, priority)` | Flag current position for deeper analysis after main line completes |

Use `mark_for_sub_exploration` when:

- Multiple candidate moves have similar evaluations (within 30cp)
- Tactical complications exist (checks, captures, threats)
- A critical decision point for the player

## NAG Rules

### Move Quality NAGs (use freely)

| NAG  | Symbol | Meaning          |
| ---- | ------ | ---------------- |
| `$1` | !      | Good move        |
| `$2` | ?      | Mistake          |
| `$3` | !!     | Brilliant move   |
| `$4` | ??     | Blunder          |
| `$5` | !?     | Interesting move |
| `$6` | ?!     | Dubious move     |

### Position Evaluation NAGs (ONLY at END of variation!)

| NAG   | Symbol | Meaning                  |
| ----- | ------ | ------------------------ |
| `$10` | =      | Equal position           |
| `$13` | ∞      | Unclear                  |
| `$14` | ⩲      | Slight White advantage   |
| `$15` | ⩱      | Slight Black advantage   |
| `$16` | ±      | Moderate White advantage |
| `$17` | ∓      | Moderate Black advantage |
| `$18` | +−     | Decisive White advantage |
| `$19` | −+     | Decisive Black advantage |

**⚠️ NEVER put position NAGs mid-variation. Only at the final position of a line.**

## Comment Guidelines

Comments must be:

- **2-8 words** (50 character limit)
- **Lowercase** with no ending punctuation
- **Descriptive**, not meta-commentary

### Good Examples

- "wins the exchange"
- "threatens mate in two"
- "strong knight outpost"
- "opens the h-file"

### Bad Examples (Rejected)

- "From our perspective, this move is passive..." (meta-commentary)
- "This move is better because it controls the center" (too long)
- "Nxg7 wins material" (repeats move notation)

## Configuration

### Default Limits

| Parameter      | Default | Description                          |
| -------------- | ------- | ------------------------------------ |
| `maxToolCalls` | 200     | Hard cap on tool calls               |
| `softToolCap`  | 80      | Triggers wrap-up guidance            |
| `maxDepth`     | 100     | Maximum variation depth (half-moves) |

These limits are tuned for deep exploration that continues until positions are resolved (15-30 move variations with sub-variations).

### Stopping Heuristics

The system uses intelligent stopping:

- **Budget awareness**: Warns LLM when approaching limits
- **Tactical tension**: Continues if position has unresolved tactics
- **Eval swings**: Explores deeper when evaluation changes significantly
- **Depth limits**: Prevents infinite exploration
- **Position resolution**: Stops when positions reach decisive/drawn states

### Move Validation

The LLM is encouraged to validate moves before playing:

- `get_candidate_moves` should be called before `add_move`/`add_alternative`
- If a move wasn't in the candidate list, a warning is included in the result
- This is **soft enforcement** - moves are still allowed, but the LLM sees feedback
- Helps prevent the LLM from unknowingly playing mistakes in analysis

### Sub-Exploration Queue

When the LLM marks positions with `mark_for_sub_exploration`:

1. Positions are collected during main exploration
2. After main line completes, positions are sorted by priority (high > medium > low)
3. Up to 3 sub-explorations are processed automatically
4. Each sub-exploration uses a reduced tool budget
5. Results are merged into the final variations

## Caching

Engine evaluations are cached:

- **Per-node caching**: Stored on tree nodes
- **Session caching**: Shared across positions in same exploration
- **Minimum depth**: Only caches depth ≥ 14 evaluations
- **TTL**: 1 hour expiry

## Error Handling

Common errors and solutions:

| Error                            | Cause                   | Solution                      |
| -------------------------------- | ----------------------- | ----------------------------- |
| "Illegal move"                   | Invalid SAN             | LLM receives legal moves list |
| "Cannot add alternative to root" | No played move provided | Ensure playedMove is passed   |
| "Comment too long"               | > 50 chars              | LLM must shorten              |

## Debug Logging

Enable with `--debug` flag:

```bash
chessbeast analyze --input game.pgn --output annotated.pgn --agentic --debug
```

Shows:

- Tool calls with arguments
- Tool results and timing
- Engine evaluations
- ASCII board at branch points
