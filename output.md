(.venv) ➜  chessbeast git:(main) ✗ pnpm chessbeast analyze \                                                                                                                  
    --input game.pgn \
    --perspective black \
    --output annotated.pgn \
    --profile deep \
    --verbosity rich \
    --target-elo 1600

> chessbeast-monorepo@0.1.0 chessbeast /Users/ryanlefkowitz/projects/chess/chessbeast
> node packages/cli/dist/index.js "analyze" "--input" "game.pgn" "--perspective" "black" "--output" "annotated.pgn" "--profile" "deep" "--verbosity" "rich" "--target-elo" "1600"

ChessBeast v0.1.0

Checking services...
  ✓ Stockfish (localhost:50051) - 33ms
  ✓ Maia (localhost:50052) - 9ms
  ✓ OpenAI API
  ✓ ECO database
  ✓ Lichess Elite database

   ✔ Parsing PGN: 1 game(s)
Analyzing game: Banerjee, Shreyo vs Lefkowitz, Ryan (31 moves)
   ✔ Shallow analysis (53.4s)
   ✔ Classification
   ✔ Finding critical moments
   ✔ Deep analysis (120.2s)
   ✔ Maia analysis (2.3s)
   ✔ Complete
   ✔ LLM annotation: 12 annotations (27.5s)
   ✔ Rendering output

Summary:
  Games analyzed: 1
  Total time: 3m 24s
  Critical moments: 12
  Annotations: 12

Output written to: annotated.pgn