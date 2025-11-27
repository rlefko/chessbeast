import { describe, it, expect } from 'vitest';

import { renderPgn, parsePgn } from '../index.js';
import type { ParsedGame } from '../index.js';

describe('PGN Renderer', () => {
  describe('tag rendering', () => {
    it('renders Seven Tag Roster in correct order', () => {
      const game: ParsedGame = {
        metadata: {
          event: 'Test Event',
          site: 'Test Site',
          date: '2024.01.15',
          round: '1',
          white: 'Player One',
          black: 'Player Two',
          result: '1-0',
        },
        moves: [],
      };

      const pgn = renderPgn(game);

      expect(pgn).toContain('[Event "Test Event"]');
      expect(pgn).toContain('[Site "Test Site"]');
      expect(pgn).toContain('[Date "2024.01.15"]');
      expect(pgn).toContain('[Round "1"]');
      expect(pgn).toContain('[White "Player One"]');
      expect(pgn).toContain('[Black "Player Two"]');
      expect(pgn).toContain('[Result "1-0"]');

      // Check order
      const lines = pgn.split('\n');
      const tagLines = lines.filter((l) => l.startsWith('['));
      expect(tagLines[0]).toContain('Event');
      expect(tagLines[1]).toContain('Site');
      expect(tagLines[2]).toContain('Date');
      expect(tagLines[3]).toContain('Round');
      expect(tagLines[4]).toContain('White');
      expect(tagLines[5]).toContain('Black');
      expect(tagLines[6]).toContain('Result');
    });

    it('renders optional tags after STR', () => {
      const game: ParsedGame = {
        metadata: {
          white: 'Magnus',
          black: 'Hikaru',
          result: '1-0',
          whiteElo: 2850,
          blackElo: 2800,
          timeControl: '180+0',
          eco: 'B90',
        },
        moves: [],
      };

      const pgn = renderPgn(game);

      expect(pgn).toContain('[WhiteElo "2850"]');
      expect(pgn).toContain('[BlackElo "2800"]');
      expect(pgn).toContain('[TimeControl "180+0"]');
      expect(pgn).toContain('[ECO "B90"]');
    });

    it('uses defaults for missing optional tags', () => {
      const game: ParsedGame = {
        metadata: {
          white: 'Player1',
          black: 'Player2',
          result: '*',
        },
        moves: [],
      };

      const pgn = renderPgn(game);

      expect(pgn).toContain('[Event "?"]');
      expect(pgn).toContain('[Site "?"]');
      expect(pgn).toContain('[Date "????.??.??"]');
      expect(pgn).toContain('[Round "?"]');
      expect(pgn).not.toContain('WhiteElo');
      expect(pgn).not.toContain('BlackElo');
    });

    it('escapes special characters in tag values', () => {
      const game: ParsedGame = {
        metadata: {
          event: 'Test "Quoted" Event',
          white: "O'Brien",
          black: 'Test\\Backslash',
          result: '*',
        },
        moves: [],
      };

      const pgn = renderPgn(game);

      expect(pgn).toContain('[Event "Test \\"Quoted\\" Event"]');
      expect(pgn).toContain('[Black "Test\\\\Backslash"]');
    });
  });

  describe('move rendering', () => {
    it('renders moves with correct numbering', () => {
      const game: ParsedGame = {
        metadata: {
          white: 'A',
          black: 'B',
          result: '*',
        },
        moves: [
          { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
          { moveNumber: 1, san: 'e5', isWhiteMove: false, fenBefore: '', fenAfter: '' },
          { moveNumber: 2, san: 'Nf3', isWhiteMove: true, fenBefore: '', fenAfter: '' },
          { moveNumber: 2, san: 'Nc6', isWhiteMove: false, fenBefore: '', fenAfter: '' },
        ],
      };

      const pgn = renderPgn(game);
      const moveText = pgn.split('\n\n')[1];

      expect(moveText).toBe('1. e4 e5 2. Nf3 Nc6 *');
    });

    it('includes result at end of moves', () => {
      const results = ['1-0', '0-1', '1/2-1/2', '*'];

      for (const result of results) {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result },
          moves: [{ moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain(`e4 ${result}`);
      }
    });

    it('handles empty move list', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [],
      };

      const pgn = renderPgn(game);
      expect(pgn).toContain('*');
    });
  });

  describe('round-trip tests', () => {
    it('produces parseable output', () => {
      const originalPgn = `[Event "Test"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`;

      const games = parsePgn(originalPgn);
      const game = games[0]!;
      const rendered = renderPgn(game);
      const reparsed = parsePgn(rendered);

      expect(reparsed.length).toBe(1);
      expect(reparsed[0]!.metadata.white).toBe('Player1');
      expect(reparsed[0]!.moves.length).toBe(5);
    });

    it('preserves move data through round-trip', () => {
      const pgn = `[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const rendered = renderPgn(game);
      const reparsed = parsePgn(rendered);
      const reparsedGame = reparsed[0]!;

      // Moves should be identical
      expect(reparsedGame.moves.length).toBe(game.moves.length);
      for (let i = 0; i < game.moves.length; i++) {
        expect(reparsedGame.moves[i]!.san).toBe(game.moves[i]!.san);
        expect(reparsedGame.moves[i]!.fenBefore).toBe(game.moves[i]!.fenBefore);
        expect(reparsedGame.moves[i]!.fenAfter).toBe(game.moves[i]!.fenAfter);
      }
    });

    it('preserves metadata through round-trip', () => {
      const pgn = `[Event "Test Tournament"]
[Site "New York"]
[Date "2024.01.15"]
[Round "3"]
[White "Magnus"]
[Black "Hikaru"]
[Result "1/2-1/2"]
[WhiteElo "2850"]
[BlackElo "2800"]
[ECO "C65"]

1. e4 e5 1/2-1/2`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const rendered = renderPgn(game);
      const reparsed = parsePgn(rendered);
      const reparsedGame = reparsed[0]!;

      const original = game.metadata;
      const roundTripped = reparsedGame.metadata;

      expect(roundTripped.event).toBe(original.event);
      expect(roundTripped.site).toBe(original.site);
      expect(roundTripped.date).toBe(original.date);
      expect(roundTripped.round).toBe(original.round);
      expect(roundTripped.white).toBe(original.white);
      expect(roundTripped.black).toBe(original.black);
      expect(roundTripped.result).toBe(original.result);
      expect(roundTripped.whiteElo).toBe(original.whiteElo);
      expect(roundTripped.blackElo).toBe(original.blackElo);
      expect(roundTripped.eco).toBe(original.eco);
    });
  });

  describe('real-world examples', () => {
    it('handles Lichess-style PGN', () => {
      const pgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2024.01.15"]
[White "player1"]
[Black "player2"]
[Result "1-0"]
[WhiteElo "1500"]
[BlackElo "1480"]
[TimeControl "300+0"]
[ECO "B90"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const rendered = renderPgn(game);
      const reparsed = parsePgn(rendered);

      expect(reparsed[0]!.moves.length).toBe(10);
      expect(reparsed[0]!.metadata.eco).toBe('B90');
    });

    it('handles short games correctly', () => {
      // Scholar's mate
      const pgn = `[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

      const games = parsePgn(pgn);
      const game = games[0]!;
      const rendered = renderPgn(game);
      const reparsed = parsePgn(rendered);

      expect(reparsed[0]!.moves.length).toBe(7);
      expect(reparsed[0]!.moves[6]!.san).toBe('Qxf7#');
    });
  });

  describe('annotation rendering', () => {
    describe('comments', () => {
      it('renders comments after moves', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '', commentAfter: 'Best move' },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('e4 {Best move}');
      });

      it('renders game comment before moves', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
          ],
          gameComment: 'An interesting game',
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('{An interesting game}');
        // Game comment should be before moves
        const gameCommentIndex = pgn.indexOf('{An interesting game}');
        const moveIndex = pgn.indexOf('1. e4');
        expect(gameCommentIndex).toBeLessThan(moveIndex);
      });

      it('escapes braces in comments', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '', commentAfter: 'A } brace' },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('{A \\} brace}');
      });
    });

    describe('NAG symbols', () => {
      it('renders NAG symbols after moves', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '', nags: ['$1'] },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('e4 $1');
      });

      it('renders multiple NAGs', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '', nags: ['$1', '$18'] },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('e4 $1 $18');
      });
    });

    describe('variations', () => {
      it('renders variations in parentheses', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              variations: [[
                { moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
              ]],
            },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('( 1. d4 )');
      });

      it('renders black move variations with ellipsis', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            { moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
            {
              moveNumber: 1,
              san: 'e5',
              isWhiteMove: false,
              fenBefore: '',
              fenAfter: '',
              variations: [[
                { moveNumber: 1, san: 'c5', isWhiteMove: false, fenBefore: '', fenAfter: '' },
              ]],
            },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('( 1... c5 )');
      });

      it('renders multiple variations', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              variations: [
                [{ moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
                [{ moveNumber: 1, san: 'c4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
              ],
            },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('( 1. d4 )');
        expect(pgn).toContain('( 1. c4 )');
      });
    });

    describe('combined annotations', () => {
      it('renders NAGs, comments, and variations in correct order', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              nags: ['$1'],
              commentAfter: 'Best',
              variations: [[
                { moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
              ]],
            },
          ],
        };

        const pgn = renderPgn(game);
        // Order should be: move, NAG, comment, variations
        expect(pgn).toMatch(/e4 \$1 \{Best\} \( 1\. d4 \)/);
      });
    });
  });

  describe('annotation round-trip tests', () => {
    it('preserves comments through parse-render cycle', () => {
      const originalPgn = `[White "A"]
[Black "B"]
[Result "*"]

1. e4 {Best move} e5 {Solid} *`;

      const games = parsePgn(originalPgn);
      const rendered = renderPgn(games[0]!);
      const reparsed = parsePgn(rendered);

      expect(reparsed[0]!.moves[0]!.commentAfter).toBe('Best move');
      expect(reparsed[0]!.moves[1]!.commentAfter).toBe('Solid');
    });

    it('preserves NAGs through parse-render cycle', () => {
      const originalPgn = `[White "A"]
[Black "B"]
[Result "*"]

1. e4 $1 e5 $2 *`;

      const games = parsePgn(originalPgn);
      const rendered = renderPgn(games[0]!);
      const reparsed = parsePgn(rendered);

      expect(reparsed[0]!.moves[0]!.nags).toContain('$1');
      expect(reparsed[0]!.moves[1]!.nags).toContain('$2');
    });

    it('preserves simple variations through parse-render cycle', () => {
      const originalPgn = `[White "A"]
[Black "B"]
[Result "*"]

1. e4 (1. d4) e5 *`;

      const games = parsePgn(originalPgn);
      const rendered = renderPgn(games[0]!);
      const reparsed = parsePgn(rendered);

      expect(reparsed[0]!.moves[0]!.variations).toHaveLength(1);
      expect(reparsed[0]!.moves[0]!.variations![0]![0]!.san).toBe('d4');
    });
  });
});
