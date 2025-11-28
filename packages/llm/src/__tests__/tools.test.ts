/**
 * Tests for tool definitions and executor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  AGENTIC_TOOLS,
  TOOL_NAMES,
  ToolExecutor,
  type AgenticServices,
  type ToolCall,
} from '../tools/index.js';

describe('Tool Definitions', () => {
  describe('AGENTIC_TOOLS', () => {
    it('should have 5 tools defined', () => {
      expect(AGENTIC_TOOLS).toHaveLength(5);
    });

    it('should have all required tool names', () => {
      const toolNames = AGENTIC_TOOLS.map((t) => t.function.name);
      expect(toolNames).toContain('evaluate_position');
      expect(toolNames).toContain('predict_human_moves');
      expect(toolNames).toContain('lookup_opening');
      expect(toolNames).toContain('find_reference_games');
      expect(toolNames).toContain('make_move');
    });

    it('should have correct structure for each tool', () => {
      for (const tool of AGENTIC_TOOLS) {
        expect(tool.type).toBe('function');
        expect(tool.function).toBeDefined();
        expect(tool.function.name).toBeDefined();
        expect(tool.function.description).toBeDefined();
        expect(tool.function.parameters).toBeDefined();
        expect(tool.function.parameters.type).toBe('object');
      }
    });
  });

  describe('TOOL_NAMES', () => {
    it('should be an object with all tool name constants', () => {
      expect(TOOL_NAMES.EVALUATE_POSITION).toBe('evaluate_position');
      expect(TOOL_NAMES.PREDICT_HUMAN_MOVES).toBe('predict_human_moves');
      expect(TOOL_NAMES.LOOKUP_OPENING).toBe('lookup_opening');
      expect(TOOL_NAMES.FIND_REFERENCE_GAMES).toBe('find_reference_games');
      expect(TOOL_NAMES.MAKE_MOVE).toBe('make_move');
    });
  });

  describe('evaluate_position tool', () => {
    const tool = AGENTIC_TOOLS.find((t) => t.function.name === 'evaluate_position')!;

    it('should have fen as required parameter', () => {
      expect(tool.function.parameters.required).toContain('fen');
    });

    it('should have depth as optional parameter', () => {
      expect(tool.function.parameters.properties).toHaveProperty('depth');
      expect(tool.function.parameters.required).not.toContain('depth');
    });

    it('should have multipv as optional parameter', () => {
      expect(tool.function.parameters.properties).toHaveProperty('multipv');
    });
  });

  describe('predict_human_moves tool', () => {
    const tool = AGENTIC_TOOLS.find((t) => t.function.name === 'predict_human_moves')!;

    it('should have fen as required parameter', () => {
      expect(tool.function.parameters.required).toContain('fen');
    });

    it('should have rating as optional parameter with default', () => {
      expect(tool.function.parameters.properties).toHaveProperty('rating');
      // Rating has a default so it's not required
      expect(tool.function.parameters.required).not.toContain('rating');
    });
  });

  describe('lookup_opening tool', () => {
    const tool = AGENTIC_TOOLS.find((t) => t.function.name === 'lookup_opening')!;

    it('should have fen parameter', () => {
      expect(tool.function.parameters.properties).toHaveProperty('fen');
    });

    it('should require fen', () => {
      expect(tool.function.parameters.required).toContain('fen');
    });
  });

  describe('find_reference_games tool', () => {
    const tool = AGENTIC_TOOLS.find((t) => t.function.name === 'find_reference_games')!;

    it('should have fen as required parameter', () => {
      expect(tool.function.parameters.required).toContain('fen');
    });

    it('should have limit as optional parameter', () => {
      expect(tool.function.parameters.properties).toHaveProperty('limit');
    });
  });

  describe('make_move tool', () => {
    const tool = AGENTIC_TOOLS.find((t) => t.function.name === 'make_move')!;

    it('should have fen and move as required parameters', () => {
      expect(tool.function.parameters.required).toContain('fen');
      expect(tool.function.parameters.required).toContain('move');
    });
  });
});

describe('ToolExecutor', () => {
  let mockServices: AgenticServices;
  let executor: ToolExecutor;

  beforeEach(() => {
    // Create mock services with correct method names
    // Use double cast to satisfy exactOptionalPropertyTypes
    mockServices = {
      stockfish: {
        evaluate: vi.fn().mockResolvedValue({
          cp: 50,
          mate: 0,
          bestLine: ['e2e4', 'e7e5', 'g1f3'],
          depth: 20,
        }),
        isAlive: vi.fn().mockResolvedValue(true),
      },
      maia: {
        predict: vi.fn().mockResolvedValue({
          predictions: [
            { move: 'e2e4', probability: 0.4 },
            { move: 'd2d4', probability: 0.3 },
          ],
        }),
        isAlive: vi.fn().mockResolvedValue(true),
      },
      eco: {
        lookupByFen: vi.fn().mockResolvedValue({
          eco: 'C00',
          name: 'French Defense',
          fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          moves: '1. e4 e6',
        }),
      },
      lichess: {
        getReferenceGames: vi.fn().mockReturnValue({
          games: [
            {
              white: 'Carlsen',
              black: 'Anand',
              result: '1-0',
              date: '2023-01-01',
              event: 'World Championship',
              eco: 'C00',
            },
          ],
          totalCount: 1,
        }),
      },
    } as unknown as AgenticServices;

    executor = new ToolExecutor(mockServices, 1500);
  });

  describe('execute', () => {
    it('should execute evaluate_position tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'evaluate_position',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            depth: 20,
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_1');
      expect(result.result).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(mockServices.stockfish.evaluate).toHaveBeenCalled();
    });

    it('should execute predict_human_moves tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_2',
        type: 'function',
        function: {
          name: 'predict_human_moves',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            rating: 1500,
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_2');
      expect(result.error).toBeUndefined();
      expect(mockServices.maia!.predict).toHaveBeenCalled();
    });

    it('should execute lookup_opening tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_3',
        type: 'function',
        function: {
          name: 'lookup_opening',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_3');
      expect(result.error).toBeUndefined();
      // The current implementation doesn't use ECO service directly for FEN-only lookups
      // It returns {found: false} because it needs move sequences for accurate ECO lookup
      const openingResult = result.result as { found: boolean };
      expect(openingResult).toBeDefined();
      expect(openingResult.found).toBe(false);
    });

    it('should execute find_reference_games tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_4',
        type: 'function',
        function: {
          name: 'find_reference_games',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            limit: 5,
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_4');
      expect(result.error).toBeUndefined();
      expect(mockServices.lichess.getReferenceGames).toHaveBeenCalled();
    });

    it('should handle unknown tool gracefully', async () => {
      const toolCall: ToolCall = {
        id: 'call_unknown',
        type: 'function',
        function: {
          name: 'unknown_tool',
          arguments: '{}',
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_unknown');
      expect(result.error).toContain('Unknown tool');
    });

    it('should handle execution errors', async () => {
      (mockServices.stockfish.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection failed'),
      );

      const toolCall: ToolCall = {
        id: 'call_error',
        type: 'function',
        function: {
          name: 'evaluate_position',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.error).toBe('Connection failed');
    });
  });

  describe('executeAll', () => {
    it('should execute multiple tool calls', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'evaluate_position',
            arguments: JSON.stringify({
              fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            }),
          },
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'lookup_opening',
            arguments: JSON.stringify({
              fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            }),
          },
        },
      ];

      const results = await executor.executeAll(toolCalls);

      expect(results).toHaveLength(2);
      expect(results[0]!.toolCallId).toBe('call_1');
      expect(results[1]!.toolCallId).toBe('call_2');
    });
  });

  describe('statistics', () => {
    it('should track tool call count', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'evaluate_position',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          }),
        },
      };

      await executor.execute(toolCall);
      await executor.execute({ ...toolCall, id: 'call_2' });

      expect(executor.getToolCallCount()).toBe(2);
    });

    it('should return stats array', async () => {
      await executor.execute({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'evaluate_position',
          arguments: JSON.stringify({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }),
        },
      });

      const stats = executor.getStats();

      expect(Array.isArray(stats)).toBe(true);
      expect(stats).toHaveLength(1);
      expect(stats[0]!).toHaveProperty('toolName');
      expect(stats[0]!).toHaveProperty('durationMs');
      expect(stats[0]!).toHaveProperty('success');
    });

    it('should reset stats', async () => {
      await executor.execute({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'evaluate_position',
          arguments: JSON.stringify({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }),
        },
      });

      executor.resetStats();

      expect(executor.getToolCallCount()).toBe(0);
      expect(executor.getStats()).toHaveLength(0);
    });
  });

  describe('make_move tool', () => {
    it('should apply a move and return new FEN', async () => {
      const toolCall: ToolCall = {
        id: 'call_move',
        type: 'function',
        function: {
          name: 'make_move',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            move: 'e4',
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      // The make_move tool uses ChessPosition to apply the move
      const moveResult = result.result as { success: boolean; fenAfter?: string; sanMove?: string };
      expect(moveResult.success).toBe(true);
      expect(moveResult.fenAfter).toBeDefined();
      expect(moveResult.sanMove).toBe('e4');
    });

    it('should handle illegal moves gracefully', async () => {
      const toolCall: ToolCall = {
        id: 'call_illegal',
        type: 'function',
        function: {
          name: 'make_move',
          arguments: JSON.stringify({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            move: 'Ke2', // Illegal - can't move king to e2
          }),
        },
      };

      const result = await executor.execute(toolCall);

      expect(result.error).toBeUndefined();
      // The tool catches errors and returns {success: false, error: ...}
      const moveResult = result.result as { success: boolean; error?: string };
      expect(moveResult.success).toBe(false);
    });
  });
});
