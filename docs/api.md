# Service APIs

ChessBeast uses gRPC for communication between the TypeScript orchestrator and Python services. This document describes the service interfaces.

## Protocol Buffer Definitions

Proto files are located in `services/protos/`:
- `common.proto` - Shared types
- `stockfish.proto` - Stockfish engine service
- `maia.proto` - Maia prediction service

## Stockfish Service

**Port**: 50051

The Stockfish service wraps the UCI chess engine for position evaluation.

### Service Definition

```protobuf
service StockfishService {
  rpc Evaluate(EvaluateRequest) returns (EvaluateResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

### Evaluate

Evaluates a chess position and returns the engine's assessment.

**Request**:
```protobuf
message EvaluateRequest {
  string fen = 1;           // Position in FEN notation
  int32 depth = 2;          // Search depth (0 = use time limit)
  int32 time_limit_ms = 3;  // Time limit in milliseconds
  int32 multipv = 4;        // Number of principal variations (default 1)
  int64 nodes = 5;          // Node limit (0 = no limit)
}
```

**Response**:
```protobuf
message EvaluateResponse {
  int32 cp = 1;                           // Centipawns (from side to move)
  int32 mate = 2;                         // Mate in N (0 if not mate)
  int32 depth = 3;                        // Actual depth searched
  repeated string best_line = 4;          // Best line in UCI notation
  repeated EvaluateResponse alternatives = 5;  // MultiPV results
}
```

**Example** (TypeScript):
```typescript
import { StockfishClient } from '@chessbeast/grpc-client';

const client = new StockfishClient('localhost:50051');

const result = await client.evaluate({
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  depth: 20,
  multipv: 3
});

console.log(`Evaluation: ${result.cp} centipawns`);
console.log(`Best line: ${result.bestLine.join(' ')}`);
```

### HealthCheck

Checks if the service is healthy and returns the Stockfish version.

**Request**:
```protobuf
message HealthCheckRequest {}
```

**Response**:
```protobuf
message HealthCheckResponse {
  bool healthy = 1;
  string version = 2;  // Stockfish version string
}
```

---

## Maia Service

**Port**: 50052

The Maia service uses the Maia2 neural network to predict human-like moves and estimate player ratings.

### Service Definition

```protobuf
service MaiaService {
  rpc PredictMoves(PredictRequest) returns (PredictResponse);
  rpc EstimateRating(EstimateRatingRequest) returns (EstimateRatingResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

### PredictMoves

Predicts the most likely human moves for a position at a given rating level.

**Request**:
```protobuf
message PredictRequest {
  string fen = 1;         // Position in FEN notation
  int32 rating_band = 2;  // Target rating (e.g., 1500)
}
```

**Response**:
```protobuf
message MovePrediction {
  string move = 1;       // Move in UCI format
  float probability = 2; // Probability (0.0 - 1.0)
}

message PredictResponse {
  repeated MovePrediction predictions = 1;
}
```

**Example** (TypeScript):
```typescript
import { MaiaClient } from '@chessbeast/grpc-client';

const client = new MaiaClient('localhost:50052');

const result = await client.predictMoves({
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  ratingBand: 1500
});

for (const prediction of result.predictions) {
  console.log(`${prediction.move}: ${(prediction.probability * 100).toFixed(1)}%`);
}
```

### EstimateRating

Estimates a player's rating based on a sequence of moves.

**Request**:
```protobuf
message GameMove {
  string fen = 1;          // Position before the move
  string played_move = 2;  // Move played in UCI format
}

message EstimateRatingRequest {
  repeated GameMove moves = 1;
}
```

**Response**:
```protobuf
message EstimateRatingResponse {
  int32 estimated_rating = 1;  // Point estimate
  int32 confidence_low = 2;    // Lower bound of estimate
  int32 confidence_high = 3;   // Upper bound of estimate
}
```

**Example** (TypeScript):
```typescript
const rating = await client.estimateRating({
  moves: [
    { fen: 'startpos', playedMove: 'e2e4' },
    { fen: '...', playedMove: 'd7d5' },
    // ... more moves
  ]
});

console.log(`Estimated rating: ${rating.estimatedRating}`);
console.log(`Confidence: ${rating.confidenceLow}-${rating.confidenceHigh}`);
```

### HealthCheck

Checks if the service is healthy and reports loaded models.

**Request**:
```protobuf
message HealthCheckRequest {}
```

**Response**:
```protobuf
message HealthCheckResponse {
  bool healthy = 1;
  repeated int32 loaded_models = 2;  // Rating bands with loaded models
}
```

---

## Common Types

Shared types used across services:

```protobuf
message Position {
  string fen = 1;  // FEN notation
}

message Move {
  string san = 1;  // Standard Algebraic Notation (e.g., "Nf3")
  string uci = 2;  // UCI format (e.g., "g1f3")
}
```

---

## Error Handling

gRPC services use standard status codes:

| Code | Meaning |
|------|---------|
| `OK` | Success |
| `INVALID_ARGUMENT` | Invalid FEN, bad parameters |
| `DEADLINE_EXCEEDED` | Request timed out |
| `UNAVAILABLE` | Service not running |
| `INTERNAL` | Unexpected error |

TypeScript clients throw errors with these codes. Handle them appropriately:

```typescript
import { status } from '@grpc/grpc-js';

try {
  const result = await client.evaluate(request);
} catch (error) {
  if (error.code === status.DEADLINE_EXCEEDED) {
    console.log('Request timed out');
  } else if (error.code === status.UNAVAILABLE) {
    console.log('Service not running');
  }
}
```

---

## Running Services

### Local Development

```bash
# Start both services
make run

# Start individually
make run-stockfish
make run-maia
```

### Docker

```bash
# Build and start
make docker-build
make docker-up

# Stop
make docker-down
```

### Service Configuration

Services can be configured via environment variables:

**Stockfish Service**:
| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKFISH_PATH` | `stockfish` | Path to Stockfish binary |
| `STOCKFISH_POOL_SIZE` | `4` | Number of engine instances |
| `STOCKFISH_PORT` | `50051` | gRPC port |

**Maia Service**:
| Variable | Default | Description |
|----------|---------|-------------|
| `MAIA_MODEL_TYPE` | `rapid` | Model type: `rapid` or `blitz` |
| `MAIA_DEVICE` | `cpu` | Device: `cpu` or `cuda` |
| `MAIA_PORT` | `50052` | gRPC port |
