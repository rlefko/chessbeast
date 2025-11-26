/**
 * Error thrown when PGN parsing fails
 */
export class PgnParseError extends Error {
  constructor(
    message: string,
    public line?: number,
    public column?: number,
  ) {
    super(message);
    this.name = 'PgnParseError';
  }
}

/**
 * Error thrown when a FEN string is invalid
 */
export class InvalidFenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFenError';
  }
}

/**
 * Error thrown when an illegal move is attempted
 */
export class IllegalMoveError extends Error {
  constructor(san: string, fen: string) {
    super(`Illegal move "${san}" in position: ${fen}`);
    this.name = 'IllegalMoveError';
  }
}
