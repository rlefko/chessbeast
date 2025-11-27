import { describe, it, expect } from 'vitest';

import {
  GrpcClientError,
  ConnectionError,
  TimeoutError,
  InvalidArgumentError,
  ServiceUnavailableError,
  InternalError,
  mapGrpcError,
} from '../errors.js';

describe('Error Classes', () => {
  describe('GrpcClientError', () => {
    it('should create error with message', () => {
      const error = new GrpcClientError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('GrpcClientError');
    });

    it('should create error with code and details', () => {
      const error = new GrpcClientError('Test error', 3, 'Additional details');
      expect(error.code).toBe(3);
      expect(error.details).toBe('Additional details');
    });

    it('should be instanceof Error', () => {
      const error = new GrpcClientError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GrpcClientError);
    });
  });

  describe('ConnectionError', () => {
    it('should include host and port in message', () => {
      const error = new ConnectionError('localhost', 50051);
      expect(error.message).toContain('localhost:50051');
      expect(error.host).toBe('localhost');
      expect(error.port).toBe(50051);
      expect(error.name).toBe('ConnectionError');
    });

    it('should include cause message', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new ConnectionError('localhost', 50051, cause);
      expect(error.message).toContain('ECONNREFUSED');
    });

    it('should have UNAVAILABLE code', () => {
      const error = new ConnectionError('localhost', 50051);
      expect(error.code).toBe(14);
    });
  });

  describe('TimeoutError', () => {
    it('should include operation and timeout in message', () => {
      const error = new TimeoutError('evaluate', 30000);
      expect(error.message).toContain('evaluate');
      expect(error.message).toContain('30000');
      expect(error.operation).toBe('evaluate');
      expect(error.timeoutMs).toBe(30000);
      expect(error.name).toBe('TimeoutError');
    });

    it('should have DEADLINE_EXCEEDED code', () => {
      const error = new TimeoutError('test', 1000);
      expect(error.code).toBe(4);
    });
  });

  describe('InvalidArgumentError', () => {
    it('should create with message', () => {
      const error = new InvalidArgumentError('Invalid FEN format');
      expect(error.message).toBe('Invalid FEN format');
      expect(error.name).toBe('InvalidArgumentError');
    });

    it('should have INVALID_ARGUMENT code', () => {
      const error = new InvalidArgumentError('test');
      expect(error.code).toBe(3);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should include service name', () => {
      const error = new ServiceUnavailableError('Stockfish');
      expect(error.message).toContain('Stockfish');
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('should include reason if provided', () => {
      const error = new ServiceUnavailableError('Maia', 'Model not loaded');
      expect(error.message).toContain('Model not loaded');
    });

    it('should have UNAVAILABLE code', () => {
      const error = new ServiceUnavailableError('test');
      expect(error.code).toBe(14);
    });
  });

  describe('InternalError', () => {
    it('should create with message', () => {
      const error = new InternalError('Unexpected error');
      expect(error.message).toBe('Unexpected error');
      expect(error.name).toBe('InternalError');
    });

    it('should have INTERNAL code', () => {
      const error = new InternalError('test');
      expect(error.code).toBe(13);
    });
  });
});

describe('mapGrpcError', () => {
  it('should map INVALID_ARGUMENT (3) to InvalidArgumentError', () => {
    const error = mapGrpcError(3, 'Invalid FEN');
    expect(error).toBeInstanceOf(InvalidArgumentError);
    expect(error.message).toBe('Invalid FEN');
  });

  it('should map DEADLINE_EXCEEDED (4) to TimeoutError', () => {
    const error = mapGrpcError(4, 'Request timeout');
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it('should map UNAVAILABLE (14) to ServiceUnavailableError', () => {
    const error = mapGrpcError(14, 'Service unavailable');
    expect(error).toBeInstanceOf(ServiceUnavailableError);
  });

  it('should map INTERNAL (13) to InternalError', () => {
    const error = mapGrpcError(13, 'Internal error');
    expect(error).toBeInstanceOf(InternalError);
  });

  it('should map unknown codes to GrpcClientError', () => {
    const error = mapGrpcError(999, 'Unknown error', 'Details');
    expect(error).toBeInstanceOf(GrpcClientError);
    expect(error.code).toBe(999);
    expect(error.details).toBe('Details');
  });
});
