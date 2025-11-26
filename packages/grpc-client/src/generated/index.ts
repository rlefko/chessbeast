/**
 * gRPC Generated Stubs
 *
 * This file is a placeholder. Run `make build-protos` after installing
 * grpc-tools to generate actual TypeScript stubs from the proto files.
 */

export const STUB_VERSION = '0.1.0';

// Placeholder types - will be replaced by generated code
export interface Position {
  fen: string;
}

export interface Move {
  san: string;
  uci: string;
}

export interface EvaluateRequest {
  fen: string;
  depth?: number;
  timeLimitMs?: number;
  multipv?: number;
  nodes?: number;
}

export interface EvaluateResponse {
  cp: number;
  mate: number;
  depth: number;
  bestLine: string[];
  alternatives: EvaluateResponse[];
}
