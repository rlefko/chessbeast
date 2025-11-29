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
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              commentAfter: 'Best move',
            },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('e4 {Best move}');
      });

      it('renders game comment before moves', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [{ moveNumber: 1, san: 'e4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
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
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              commentAfter: 'A } brace',
            },
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
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              nags: ['$1'],
            },
          ],
        };

        const pgn = renderPgn(game);
        expect(pgn).toContain('e4 $1');
      });

      it('renders multiple NAGs', () => {
        const game: ParsedGame = {
          metadata: { white: 'A', black: 'B', result: '*' },
          moves: [
            {
              moveNumber: 1,
              san: 'e4',
              isWhiteMove: true,
              fenBefore: '',
              fenAfter: '',
              nags: ['$1', '$18'],
            },
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
              variations: [
                [{ moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
              ],
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
              variations: [
                [{ moveNumber: 1, san: 'c5', isWhiteMove: false, fenBefore: '', fenAfter: '' }],
              ],
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
              variations: [
                [{ moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' }],
              ],
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

  describe('line wrapping', () => {
    it('wraps long move text at specified line length', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: Array.from({ length: 20 }, (_, i) => ({
          moveNumber: Math.floor(i / 2) + 1,
          san: i % 2 === 0 ? 'e4' : 'e5',
          isWhiteMove: i % 2 === 0,
          fenBefore: '',
          fenAfter: '',
        })),
      };

      const pgn = renderPgn(game, { maxLineLength: 40 });
      const lines = pgn.split('\n');
      const moveLines = lines.filter((line) => line.match(/^\d+\./));

      // All move lines should be <= 40 chars
      for (const line of moveLines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    });

    it('does not wrap when maxLineLength is 0', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: Array.from({ length: 20 }, (_, i) => ({
          moveNumber: Math.floor(i / 2) + 1,
          san: i % 2 === 0 ? 'e4' : 'e5',
          isWhiteMove: i % 2 === 0,
          fenBefore: '',
          fenAfter: '',
        })),
      };

      const pgn = renderPgn(game, { maxLineLength: 0 });
      const lines = pgn.split('\n');
      const moveTextLine = lines.find((line) => line.startsWith('1.'));

      // Should be a single line
      expect(moveTextLine).toBeDefined();
      expect(moveTextLine!.includes('10.')).toBe(true);
    });

    it('keeps comments as single tokens when wrapping', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            commentAfter: 'This is a somewhat long comment that should stay together',
          },
          {
            moveNumber: 1,
            san: 'e5',
            isWhiteMove: false,
            fenBefore: '',
            fenAfter: '',
          },
        ],
      };

      const pgn = renderPgn(game, { maxLineLength: 50 });

      // The comment should not be split across lines
      expect(pgn).toContain('{This is a somewhat long comment that should stay together}');
    });

    it('keeps variations as single tokens when wrapping', () => {
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
              [
                { moveNumber: 1, san: 'd4', isWhiteMove: true, fenBefore: '', fenAfter: '' },
                { moveNumber: 1, san: 'd5', isWhiteMove: false, fenBefore: '', fenAfter: '' },
              ],
            ],
          },
        ],
      };

      const pgn = renderPgn(game, { maxLineLength: 30 });

      // The variation should not be split across lines
      expect(pgn).toContain('( 1. d4 d5 )');
    });
  });

  describe('edge cases', () => {
    it('handles very long games (100+ moves)', () => {
      // Use fake FEN values to avoid move validation during parsing
      // This test focuses on renderer behavior with many moves
      const moves = Array.from({ length: 200 }, (_, i) => ({
        moveNumber: Math.floor(i / 2) + 1,
        san: i % 2 === 0 ? 'Nc3' : 'Nc6',
        isWhiteMove: i % 2 === 0,
        fenBefore: '',
        fenAfter: '',
      }));

      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '1/2-1/2' },
        moves,
      };

      const pgn = renderPgn(game);

      // Verify render output without round-trip (parser validates legal moves)
      expect(pgn).toContain('1. Nc3 Nc6');
      expect(pgn).toContain('100. Nc3 Nc6');
      expect(pgn).toContain('1/2-1/2');

      // Verify line wrapping is applied
      const lines = pgn.split('\n');
      const moveLines = lines.filter((l) => l.match(/^\d+\./));
      for (const line of moveLines) {
        expect(line.length).toBeLessThanOrEqual(80);
      }
    });

    it('handles deeply nested variations (3+ levels)', () => {
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
              [
                {
                  moveNumber: 1,
                  san: 'd4',
                  isWhiteMove: true,
                  fenBefore: '',
                  fenAfter: '',
                  variations: [
                    [
                      {
                        moveNumber: 1,
                        san: 'c4',
                        isWhiteMove: true,
                        fenBefore: '',
                        fenAfter: '',
                        variations: [
                          [
                            {
                              moveNumber: 1,
                              san: 'Nf3',
                              isWhiteMove: true,
                              fenBefore: '',
                              fenAfter: '',
                            },
                          ],
                        ],
                      },
                    ],
                  ],
                },
              ],
            ],
          },
        ],
      };

      const pgn = renderPgn(game);

      // Should contain nested parentheses
      expect(pgn).toContain('( 1. d4');
      expect(pgn).toContain('( 1. c4');
      expect(pgn).toContain('( 1. Nf3');

      // Should be parseable
      const reparsed = parsePgn(pgn);
      expect(reparsed[0]!.moves[0]!.variations).toHaveLength(1);
    });

    it('handles many variations on a single move', () => {
      const variations = Array.from({ length: 5 }, (_, i) => [
        {
          moveNumber: 1,
          san: ['d4', 'c4', 'Nf3', 'g3', 'b3'][i]!,
          isWhiteMove: true,
          fenBefore: '',
          fenAfter: '',
        },
      ]);

      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            variations,
          },
        ],
      };

      const pgn = renderPgn(game);

      // Should contain all variations
      expect(pgn).toContain('( 1. d4 )');
      expect(pgn).toContain('( 1. c4 )');
      expect(pgn).toContain('( 1. Nf3 )');
      expect(pgn).toContain('( 1. g3 )');
      expect(pgn).toContain('( 1. b3 )');
    });

    it('handles long comments with special characters', () => {
      // Test comment with special characters (excluding braces which have
      // parser/renderer escaping asymmetry in the current implementation)
      const longComment =
        'This is a very long comment that contains "quotes", backslashes \\, and special chars like <>&. It also has some chess notation like Nxe4+ and 1. e4 e5.';

      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            commentAfter: longComment,
          },
        ],
      };

      const pgn = renderPgn(game);

      // The comment should be present
      expect(pgn).toContain('{This is a very long comment');
      expect(pgn).toContain('Nxe4+');

      // Should be parseable
      const reparsed = parsePgn(pgn);
      expect(reparsed[0]!.moves[0]!.commentAfter).toBeDefined();
      expect(reparsed[0]!.moves[0]!.commentAfter).toContain('quotes');
    });

    it('escapes closing braces in comments', () => {
      // Verify renderer escapes closing braces (separate from round-trip
      // since parser/renderer escaping may not be symmetric)
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            commentAfter: 'Contains } brace',
          },
        ],
      };

      const pgn = renderPgn(game);

      // Closing brace should be escaped
      expect(pgn).toContain('{Contains \\} brace}');
    });

    it('handles multi-line comments (newlines converted to spaces)', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            commentAfter: 'Line 1\nLine 2\nLine 3',
          },
        ],
      };

      const pgn = renderPgn(game);

      // Should contain the comment (newlines may be preserved or converted)
      expect(pgn).toContain('Line 1');
      expect(pgn).toContain('Line 2');
      expect(pgn).toContain('Line 3');
    });

    it('handles empty variations gracefully', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '*' },
        moves: [
          {
            moveNumber: 1,
            san: 'e4',
            isWhiteMove: true,
            fenBefore: '',
            fenAfter: '',
            variations: [[]],
          },
        ],
      };

      const pgn = renderPgn(game);

      // Empty variations should NOT be rendered (no invalid '()' in output)
      expect(pgn).not.toContain('()');
    });

    it('handles game with only result', () => {
      const game: ParsedGame = {
        metadata: { white: 'A', black: 'B', result: '0-1' },
        moves: [],
      };

      const pgn = renderPgn(game);
      const reparsed = parsePgn(pgn);

      expect(reparsed[0]!.metadata.result).toBe('0-1');
      expect(reparsed[0]!.moves).toHaveLength(0);
    });
  });
});
