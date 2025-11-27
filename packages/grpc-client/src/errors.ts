/**
 * Error classes for gRPC client operations
 */

/**
 * Base error class for gRPC client errors
 */
export class GrpcClientError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'GrpcClientError';
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GrpcClientError);
    }
  }
}

/**
 * Error thrown when connection to gRPC service fails
 */
export class ConnectionError extends GrpcClientError {
  constructor(
    public readonly host: string,
    public readonly port: number,
    cause?: Error
  ) {
    super(
      `Failed to connect to gRPC service at ${host}:${port}${cause ? `: ${cause.message}` : ''}`,
      14, // UNAVAILABLE
      cause?.message
    );
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when a gRPC call times out
 */
export class TimeoutError extends GrpcClientError {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      4 // DEADLINE_EXCEEDED
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when invalid arguments are provided
 */
export class InvalidArgumentError extends GrpcClientError {
  constructor(message: string) {
    super(message, 3); // INVALID_ARGUMENT
    this.name = 'InvalidArgumentError';
  }
}

/**
 * Error thrown when the service is unavailable
 */
export class ServiceUnavailableError extends GrpcClientError {
  constructor(service: string, reason?: string) {
    super(
      `Service '${service}' is unavailable${reason ? `: ${reason}` : ''}`,
      14 // UNAVAILABLE
    );
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error thrown for internal service errors
 */
export class InternalError extends GrpcClientError {
  constructor(message: string) {
    super(message, 13); // INTERNAL
    this.name = 'InternalError';
  }
}

/**
 * Map gRPC status code to appropriate error class
 */
export function mapGrpcError(
  code: number,
  message: string,
  details?: string
): GrpcClientError {
  switch (code) {
    case 3: // INVALID_ARGUMENT
      return new InvalidArgumentError(message);
    case 4: // DEADLINE_EXCEEDED
      return new TimeoutError(message, 0);
    case 14: // UNAVAILABLE
      return new ServiceUnavailableError('service', message);
    case 13: // INTERNAL
      return new InternalError(message);
    default:
      return new GrpcClientError(message, code, details);
  }
}
