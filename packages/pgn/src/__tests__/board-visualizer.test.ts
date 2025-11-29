import { describe, it, expect } from 'vitest';
import { renderBoard, formatBoardForPrompt, STARTING_FEN } from '../index.js';

describe('Board Visualizer', () => {
  describe('renderBoard', () => {
    it('should render starting position correctly', () => {
      const board = renderBoard(STARTING_FEN);

      // Check file labels
      expect(board).toContain('a   b   c   d   e   f   g   h');

      // Check rank labels
      expect(board).toContain('8 ');
      expect(board).toContain('1 ');

      // Check white pieces on rank 1
      expect(board).toContain('[R]');
      expect(board).toContain('[N]');
      expect(board).toContain('[B]');
      expect(board).toContain('[Q]');
      expect(board).toContain('[K]');

      // Check black pieces on rank 8
      expect(board).toContain('[r]');
      expect(board).toContain('[n]');
      expect(board).toContain('[b]');
      expect(board).toContain('[q]');
      expect(board).toContain('[k]');

      // Check pawns
      expect(board).toContain('[P]');
      expect(board).toContain('[p]');

      // Check empty squares
      expect(board).toContain(' . ');
    });

    it('should render position after 1.e4', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const board = renderBoard(fen);

      // e4 pawn should be on rank 4
      const lines = board.split('\n');
      const rank4Line = lines.find((l) => l.startsWith('4 '));
      expect(rank4Line).toBeDefined();
      expect(rank4Line).toContain('[P]');

      // e2 should be empty now
      const rank2Line = lines.find((l) => l.startsWith('2 '));
      expect(rank2Line).toBeDefined();
      // Count the pawns on rank 2 - should be 7 after e4
      const pawnMatches = rank2Line!.match(/\[P\]/g);
      expect(pawnMatches).toHaveLength(7);
    });

    it('should render from black perspective when specified', () => {
      const board = renderBoard(STARTING_FEN, { perspective: 'black' });
      const lines = board.split('\n');

      // First rank label should be h (flipped from a)
      expect(lines[0]).toContain('h   g   f   e   d   c   b   a');

      // Rank 1 should appear at the top (black's perspective)
      expect(lines[1]!.startsWith('1 ')).toBe(true);
      expect(lines[8]!.startsWith('8 ')).toBe(true);
    });

    it('should render empty squares correctly', () => {
      // Position with many empty squares
      const fen = '8/8/8/4k3/8/8/8/4K3 w - - 0 1';
      const board = renderBoard(fen);

      // Check kings are present
      expect(board).toContain('[K]');
      expect(board).toContain('[k]');

      // Check empty squares dominate
      const dotCount = (board.match(/ \. /g) || []).length;
      expect(dotCount).toBe(62); // 64 - 2 kings
    });

    it('should handle promoted pieces', () => {
      // Position with promoted queen
      const fen = '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1';
      const board = renderBoard(fen);

      expect(board).toContain('[Q]');
      expect(board).toContain('[K]');
      expect(board).toContain('[k]');
    });

    it('should handle complex middlegame position', () => {
      // Sicilian Dragon typical position
      const fen = 'r1bqkb1r/pp2pppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6';
      const board = renderBoard(fen);

      // Should have all expected pieces
      expect(board).toContain('[r]'); // Black rooks
      expect(board).toContain('[R]'); // White rooks
      expect(board).toContain('[N]'); // White knights (2)
      expect(board).toContain('[n]'); // Black knights (2)
    });
  });

  describe('formatBoardForPrompt', () => {
    it('should include board and side to move', () => {
      const result = formatBoardForPrompt(STARTING_FEN);

      // Should contain the board
      expect(result).toContain('[R]');
      expect(result).toContain('[r]');

      // Should contain side to move
      expect(result).toContain('Side to move: White');
    });

    it('should include FEN by default', () => {
      const result = formatBoardForPrompt(STARTING_FEN);

      expect(result).toContain(`FEN: ${STARTING_FEN}`);
    });

    it('should exclude FEN when includeFen is false', () => {
      const result = formatBoardForPrompt(STARTING_FEN, { includeFen: false });

      expect(result).not.toContain('FEN:');
    });

    it('should show correct side to move for black', () => {
      const fenBlackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const result = formatBoardForPrompt(fenBlackToMove);

      expect(result).toContain('Side to move: Black');
    });

    it('should include last move when provided', () => {
      const result = formatBoardForPrompt(STARTING_FEN, {
        lastMove: { from: 'e2', to: 'e4', san: 'e4' },
      });

      expect(result).toContain('Last move: e4');
    });

    it('should respect perspective option', () => {
      const result = formatBoardForPrompt(STARTING_FEN, { perspective: 'black' });

      // File labels should be reversed
      expect(result).toContain('h   g   f   e   d   c   b   a');
    });
  });

  describe('Board rendering consistency', () => {
    it('should produce consistent output for same position', () => {
      const board1 = renderBoard(STARTING_FEN);
      const board2 = renderBoard(STARTING_FEN);

      expect(board1).toBe(board2);
    });

    it('should produce different output for different perspectives', () => {
      const whiteBoard = renderBoard(STARTING_FEN, { perspective: 'white' });
      const blackBoard = renderBoard(STARTING_FEN, { perspective: 'black' });

      expect(whiteBoard).not.toBe(blackBoard);
    });

    it('should have correct number of lines', () => {
      const board = renderBoard(STARTING_FEN);
      const lines = board.split('\n');

      // 1 header + 8 ranks + 1 footer = 10 lines
      expect(lines).toHaveLength(10);
    });

    it('should have consistent line lengths', () => {
      const board = renderBoard(STARTING_FEN);
      const lines = board.split('\n');

      // All rank lines should have same length (excluding header/footer)
      const rankLines = lines.slice(1, 9);
      const lengths = rankLines.map((l) => l.length);
      expect(new Set(lengths).size).toBe(1);
    });
  });
});
