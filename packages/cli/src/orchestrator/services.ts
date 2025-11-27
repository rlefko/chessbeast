/**
 * Service initialization and health checking
 */

import * as fs from 'node:fs';

import { EcoClient, LichessEliteClient } from '@chessbeast/database';
import { StockfishClient, MaiaClient } from '@chessbeast/grpc-client';
import { Annotator } from '@chessbeast/llm';

import type { ChessBeastConfig } from '../config/schema.js';
import { ServiceError, createServiceError } from '../errors/index.js';
import type { ServiceStatus } from '../progress/reporter.js';

/**
 * Initialized services container
 */
export interface Services {
  stockfish: StockfishClient;
  maia: MaiaClient | null;
  ecoClient: EcoClient | null;
  lichessClient: LichessEliteClient | null;
  annotator: Annotator | null;
}

/**
 * Check if Stockfish service is healthy
 */
async function checkStockfish(config: ChessBeastConfig): Promise<ServiceStatus> {
  const { host, port } = config.services.stockfish;
  const startTime = Date.now();

  try {
    const client = new StockfishClient({ host, port });
    const health = await client.healthCheck();
    const latencyMs = Date.now() - startTime;

    if (health.healthy) {
      return { name: `Stockfish (${host}:${port})`, healthy: true, latencyMs };
    }
    return { name: `Stockfish (${host}:${port})`, healthy: false, error: 'unhealthy response' };
  } catch (error) {
    return {
      name: `Stockfish (${host}:${port})`,
      healthy: false,
      error: error instanceof Error ? error.message : 'connection failed',
    };
  }
}

/**
 * Check if Maia service is healthy
 */
async function checkMaia(config: ChessBeastConfig): Promise<ServiceStatus> {
  const { host, port } = config.services.maia;
  const startTime = Date.now();

  try {
    const client = new MaiaClient({ host, port });
    const health = await client.healthCheck();
    const latencyMs = Date.now() - startTime;

    if (health.healthy) {
      return { name: `Maia (${host}:${port})`, healthy: true, latencyMs };
    }
    return { name: `Maia (${host}:${port})`, healthy: false, error: 'unhealthy response' };
  } catch (error) {
    return {
      name: `Maia (${host}:${port})`,
      healthy: false,
      error: error instanceof Error ? error.message : 'connection failed',
    };
  }
}

/**
 * Check if OpenAI API is configured
 */
function checkLlm(config: ChessBeastConfig): ServiceStatus {
  if (config.llm.apiKey) {
    return { name: 'OpenAI API', healthy: true };
  }
  return { name: 'OpenAI API', healthy: false, error: 'API key not set' };
}

/**
 * Check if ECO database exists
 */
function checkEcoDatabase(config: ChessBeastConfig): ServiceStatus {
  const path = config.databases.ecoPath;
  if (fs.existsSync(path)) {
    return { name: 'ECO database', healthy: true };
  }
  return { name: 'ECO database', healthy: false, error: 'file not found' };
}

/**
 * Check if Lichess Elite database exists
 */
function checkLichessDatabase(config: ChessBeastConfig): ServiceStatus {
  const path = config.databases.lichessPath;
  if (fs.existsSync(path)) {
    return { name: 'Lichess Elite database', healthy: true };
  }
  return { name: 'Lichess Elite database', healthy: false, error: 'file not found' };
}

/**
 * Perform all health checks
 */
export async function performHealthChecks(config: ChessBeastConfig): Promise<ServiceStatus[]> {
  const results: ServiceStatus[] = [];

  // Check Stockfish (required)
  const stockfishStatus = await checkStockfish(config);
  results.push(stockfishStatus);

  // Check Maia (optional if skipMaia)
  if (!config.analysis.skipMaia) {
    const maiaStatus = await checkMaia(config);
    results.push(maiaStatus);
  }

  // Check LLM (optional if skipLlm)
  if (!config.analysis.skipLlm) {
    const llmStatus = checkLlm(config);
    results.push(llmStatus);
  }

  // Check databases
  const ecoStatus = checkEcoDatabase(config);
  results.push(ecoStatus);

  const lichessStatus = checkLichessDatabase(config);
  results.push(lichessStatus);

  return results;
}

/**
 * Initialize all services based on config
 * Throws errors for required services that fail
 */
export async function initializeServices(config: ChessBeastConfig): Promise<Services> {
  const { host: sfHost, port: sfPort } = config.services.stockfish;
  const { host: maiaHost, port: maiaPort } = config.services.maia;

  // Initialize Stockfish (required)
  let stockfish: StockfishClient;
  try {
    stockfish = new StockfishClient({
      host: sfHost,
      port: sfPort,
      timeoutMs: config.services.stockfish.timeoutMs,
    });
    const health = await stockfish.healthCheck();
    if (!health.healthy) {
      throw createServiceError('Stockfish', sfHost, sfPort);
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw createServiceError(
      'Stockfish',
      sfHost,
      sfPort,
      error instanceof Error ? error : undefined,
    );
  }

  // Initialize Maia (optional if skipMaia)
  let maia: MaiaClient | null = null;
  if (!config.analysis.skipMaia) {
    try {
      maia = new MaiaClient({
        host: maiaHost,
        port: maiaPort,
        timeoutMs: config.services.maia.timeoutMs,
      });
      const health = await maia.healthCheck();
      if (!health.healthy) {
        throw createServiceError('Maia', maiaHost, maiaPort);
      }
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw createServiceError(
        'Maia',
        maiaHost,
        maiaPort,
        error instanceof Error ? error : undefined,
      );
    }
  }

  // Initialize ECO database (required)
  let ecoClient: EcoClient | null = null;
  if (fs.existsSync(config.databases.ecoPath)) {
    ecoClient = new EcoClient({ dbPath: config.databases.ecoPath });
  } else {
    throw new ServiceError(
      'ECO Database',
      `Database file not found: ${config.databases.ecoPath}`,
      "Run 'make setup' to download and set up the databases",
    );
  }

  // Initialize Lichess Elite database (required)
  let lichessClient: LichessEliteClient | null = null;
  if (fs.existsSync(config.databases.lichessPath)) {
    lichessClient = new LichessEliteClient({ dbPath: config.databases.lichessPath });
  } else {
    throw new ServiceError(
      'Lichess Database',
      `Database file not found: ${config.databases.lichessPath}`,
      "Run 'make setup' to download and set up the databases",
    );
  }

  // Initialize LLM annotator (optional if skipLlm)
  let annotator: Annotator | null = null;
  if (!config.analysis.skipLlm) {
    if (!config.llm.apiKey) {
      throw new ServiceError(
        'OpenAI API',
        'API key not configured',
        'Set the OPENAI_API_KEY environment variable or use --skip-llm',
      );
    }
    annotator = new Annotator({
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      temperature: config.llm.temperature,
      timeout: config.llm.timeout,
    });
  }

  return {
    stockfish,
    maia,
    ecoClient,
    lichessClient,
    annotator,
  };
}

/**
 * Close all service connections
 */
export function closeServices(_services: Services): void {
  // gRPC clients don't have explicit close methods
  // Database clients will be garbage collected
  // Nothing to do here for now
}
