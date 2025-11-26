import { describe, it, expect } from 'vitest';

import { parsePgn, STARTING_FEN, PgnParseError } from '../index.js';

describe('PGN Parser', () => {
  describe('tag parsing', () => {
    it('parses Seven Tag Roster', () => {
      const pgn = `[Event "Test Event"]
[Site "Test Site"]
[Date "2024.01.15"]
[Round "1"]
[White "Player One"]
[Black "Player Two"]
[Result "1-0"]

1. e4 1-0`;

      const games = parsePgn(pgn);
      expect(games.length).toBe(1);

      const game = games[0]!;
      const { metadata } = game;
      expect(metadata.event).toBe('Test Event');
      expect(metadata.site).toBe('Test Site');
      expect(metadata.date).toBe('2024.01.15');
      expect(metadata.round).toBe('1');
      expect(metadata.white).toBe('Player One');
      expect(metadata.black).toBe('Player Two');
      expect(metadata.result).toBe('1-0');
    });

    it('parses optional tags (Elo, TimeControl, ECO)', () => {
      const pgn = `[Event "?"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "Magnus"]
[Black "Hikaru"]
[Result "*"]
[WhiteElo "2850"]
[BlackElo "2800"]
[TimeControl "180+0"]
[ECO "B90"]

1. e4 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { metadata } = game;

      expect(metadata.whiteElo).toBe(2850);
      expect(metadata.blackElo).toBe(2800);
      expect(metadata.timeControl).toBe('180+0');
      expect(metadata.eco).toBe('B90');
    });

    it('handles missing optional tags', () => {
      const pgn = `[White "Player1"]
[Black "Player2"]
[Result "*"]

1. e4 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { metadata } = game;

      expect(metadata.whiteElo).toBeUndefined();
      expect(metadata.blackElo).toBeUndefined();
      expect(metadata.timeControl).toBeUndefined();
      expect(metadata.eco).toBeUndefined();
    });

    it('handles unknown Elo values', () => {
      const pgn = `[White "Player1"]
[Black "Player2"]
[Result "*"]
[WhiteElo "?"]
[BlackElo "-"]

1. e4 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { metadata } = game;

      expect(metadata.whiteElo).toBeUndefined();
      expect(metadata.blackElo).toBeUndefined();
    });

    it('provides defaults for missing required tags', () => {
      const pgn = `[Result "*"]

1. e4 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { metadata } = game;

      expect(metadata.white).toBe('Unknown');
      expect(metadata.black).toBe('Unknown');
    });
  });

  describe('move parsing', () => {
    it('parses basic pawn moves', () => {
      const pgn = `[Result "*"]

1. e4 e5 2. d4 d5 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves.length).toBe(4);
      expect(moves[0]!.san).toBe('e4');
      expect(moves[1]!.san).toBe('e5');
      expect(moves[2]!.san).toBe('d4');
      expect(moves[3]!.san).toBe('d5');
    });

    it('parses piece moves', () => {
      const pgn = `[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[2]!.san).toBe('Nf3');
      expect(moves[3]!.san).toBe('Nc6');
      expect(moves[4]!.san).toBe('Bc4');
      expect(moves[5]!.san).toBe('Nf6');
    });

    it('parses captures', () => {
      const pgn = `[Result "*"]

1. e4 d5 2. exd5 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[2]!.san).toBe('exd5');
    });

    it('parses castling', () => {
      const pgn = `[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[6]!.san).toBe('O-O'); // White castles
      expect(moves[9]!.san).toBe('O-O'); // Black castles
    });

    it('parses pawn promotion', () => {
      const pgn = `[FEN "8/P7/8/8/8/8/8/K6k w - - 0 1"]
[Result "*"]

1. a8=Q *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      // chess.js includes check indicator in SAN
      expect(moves[0]!.san).toBe('a8=Q+');
    });

    it('parses check and checkmate indicators', () => {
      const pgn = `[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[3]!.san).toBe('Qh4#');
    });

    it('parses disambiguated moves', () => {
      // Position where two rooks can move to d1
      const pgn = `[FEN "r2qk2r/ppp2ppp/2n2n2/3pp1B1/1b2P3/2NP1N2/PPP2PPP/R2QK2R w KQkq - 0 1"]
[Result "*"]

1. Qd2 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[0]!.san).toBe('Qd2');
    });
  });

  describe('FEN generation', () => {
    it('generates correct FEN for each move', () => {
      const pgn = `[Result "*"]

1. e4 e5 2. Nf3 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      // First move starts from starting position
      expect(moves[0]!.fenBefore).toBe(STARTING_FEN);
      // Note: chess.js normalizes en passant - removes if no capture possible
      expect(moves[0]!.fenAfter).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

      // Second move continues from first move's fenAfter
      expect(moves[1]!.fenBefore).toBe(moves[0]!.fenAfter);
      expect(moves[1]!.fenAfter).toBe(
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      );

      // Third move continues chain
      expect(moves[2]!.fenBefore).toBe(moves[1]!.fenAfter);
    });

    it('tracks move numbers correctly', () => {
      const pgn = `[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const { moves } = game;

      expect(moves[0]!.moveNumber).toBe(1);
      expect(moves[0]!.isWhiteMove).toBe(true);

      expect(moves[1]!.moveNumber).toBe(1);
      expect(moves[1]!.isWhiteMove).toBe(false);

      expect(moves[2]!.moveNumber).toBe(2);
      expect(moves[2]!.isWhiteMove).toBe(true);

      expect(moves[3]!.moveNumber).toBe(2);
      expect(moves[3]!.isWhiteMove).toBe(false);

      expect(moves[4]!.moveNumber).toBe(3);
      expect(moves[4]!.isWhiteMove).toBe(true);
    });
  });

  describe('multi-game files', () => {
    it('parses multiple games', () => {
      const pgn = `[Event "Game 1"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 1-0

[Event "Game 2"]
[White "C"]
[Black "D"]
[Result "0-1"]

1. d4 0-1`;

      const games = parsePgn(pgn);

      expect(games.length).toBe(2);
      expect(games[0]!.metadata.event).toBe('Game 1');
      expect(games[0]!.metadata.white).toBe('A');
      expect(games[1]!.metadata.event).toBe('Game 2');
      expect(games[1]!.metadata.white).toBe('C');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const games = parsePgn('');
      expect(games.length).toBe(0);
    });

    it('handles whitespace-only input', () => {
      const games = parsePgn('   \n\n   ');
      expect(games.length).toBe(0);
    });

    it('handles games with comments (comments are ignored)', () => {
      const pgn = `[Result "*"]

1. e4 {Best by test} e5 {Solid reply} *`;

      const games = parsePgn(pgn);
      expect(games[0]!.moves.length).toBe(2);
    });

    it('handles games with NAG symbols (NAGs are ignored)', () => {
      const pgn = `[Result "*"]

1. e4 $1 e5 $2 *`;

      const games = parsePgn(pgn);
      expect(games[0]!.moves.length).toBe(2);
    });

    it('handles various result formats', () => {
      const results = ['1-0', '0-1', '1/2-1/2', '*'];

      for (const result of results) {
        const pgn = `[Result "${result}"]

1. e4 ${result}`;

        const games = parsePgn(pgn);
        expect(games[0]!.metadata.result).toBe(result);
      }
    });
  });

  describe('error handling', () => {
    it('throws PgnParseError for malformed PGN', () => {
      const pgn = '[Event "Unclosed tag';
      expect(() => parsePgn(pgn)).toThrow(PgnParseError);
    });

    it('throws error for illegal moves', () => {
      const pgn = `[Result "*"]

1. e4 e4 *`; // Black can't play e4

      expect(() => parsePgn(pgn)).toThrow();
    });
  });
});
