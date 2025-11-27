/**
 * Base gRPC client with proto loading and connection management
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GrpcClientError, ConnectionError, mapGrpcError } from '../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for gRPC client connections
 */
export interface ClientConfig {
  /** Host to connect to */
  host: string;
  /** Port to connect to */
  port: number;
  /** Timeout in milliseconds for RPC calls */
  timeoutMs?: number;
}

/**
 * Proto loader options for proper camelCase handling
 */
const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false, // Convert snake_case to camelCase
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
};

/**
 * Cache for loaded proto definitions
 */
const protoCache = new Map<string, grpc.GrpcObject>();

/**
 * Base class for gRPC clients with common functionality
 */
export abstract class BaseGrpcClient {
  protected client: grpc.Client | null = null;
  protected readonly config: Required<ClientConfig>;
  private connectionPromise: Promise<grpc.Client> | null = null;

  constructor(config: ClientConfig) {
    this.config = {
      host: config.host,
      port: config.port,
      timeoutMs: config.timeoutMs ?? 30000,
    };
  }

  /**
   * Get the path to the proto file
   */
  protected abstract getProtoPath(): string;

  /**
   * Get the service name within the proto
   */
  protected abstract getServiceName(): string;

  /**
   * Get the package name for the service
   */
  protected abstract getPackageName(): string;

  /**
   * Get the proto root directory
   */
  protected getProtoRoot(): string {
    // Navigate from packages/grpc-client/src/clients/ to services/protos/
    return path.resolve(__dirname, '../../../../../services/protos');
  }

  /**
   * Load proto definition and cache it
   */
  protected async loadProto(): Promise<grpc.GrpcObject> {
    const protoPath = this.getProtoPath();

    if (protoCache.has(protoPath)) {
      return protoCache.get(protoPath)!;
    }

    const fullProtoPath = path.join(this.getProtoRoot(), protoPath);

    const packageDefinition = await protoLoader.load(fullProtoPath, {
      ...PROTO_LOADER_OPTIONS,
      includeDirs: [this.getProtoRoot()],
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);
    protoCache.set(protoPath, proto);
    return proto;
  }

  /**
   * Navigate to the service constructor in the proto object
   */
  protected getServiceConstructor(proto: grpc.GrpcObject): grpc.ServiceClientConstructor {
    const packageParts = this.getPackageName().split('.');
    let current: grpc.GrpcObject = proto;

    for (const part of packageParts) {
      current = current[part] as grpc.GrpcObject;
      if (!current) {
        throw new GrpcClientError(`Package '${this.getPackageName()}' not found in proto`);
      }
    }

    const ServiceConstructor = current[this.getServiceName()] as grpc.ServiceClientConstructor;
    if (!ServiceConstructor) {
      throw new GrpcClientError(`Service '${this.getServiceName()}' not found in package '${this.getPackageName()}'`);
    }

    return ServiceConstructor;
  }

  /**
   * Ensure connection is established (lazy initialization)
   */
  protected async ensureConnected(): Promise<grpc.Client> {
    if (this.client) {
      return this.client;
    }

    // Prevent multiple simultaneous connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();

    try {
      this.client = await this.connectionPromise;
      return this.client;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Establish connection to the gRPC service
   */
  private async connect(): Promise<grpc.Client> {
    try {
      const proto = await this.loadProto();
      const ServiceConstructor = this.getServiceConstructor(proto);

      const address = `${this.config.host}:${this.config.port}`;
      const client = new ServiceConstructor(
        address,
        grpc.credentials.createInsecure()
      );

      return client;
    } catch (err) {
      if (err instanceof GrpcClientError) {
        throw err;
      }
      throw new ConnectionError(this.config.host, this.config.port, err as Error);
    }
  }

  /**
   * Make a unary RPC call with proper error handling and deadline
   */
  protected async unaryCall<TRequest, TResponse>(
    method: string,
    request: TRequest
  ): Promise<TResponse> {
    const client = await this.ensureConnected();

    // Create deadline
    const deadline = new Date(Date.now() + this.config.timeoutMs);

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const methodFn = (client as any)[method] as (
        request: TRequest,
        metadata: grpc.Metadata,
        options: { deadline: Date },
        callback: (err: grpc.ServiceError | null, response: TResponse) => void
      ) => void;

      if (typeof methodFn !== 'function') {
        reject(new GrpcClientError(`Method '${method}' not found on service`));
        return;
      }

      methodFn.call(
        client,
        request,
        new grpc.Metadata(),
        { deadline },
        (err: grpc.ServiceError | null, response: TResponse) => {
          if (err) {
            reject(mapGrpcError(err.code, err.message, err.details));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Close the connection
   */
  public close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Get the server address
   */
  public get address(): string {
    return `${this.config.host}:${this.config.port}`;
  }
}
