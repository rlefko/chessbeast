/**
 * Service initialization and health checking
 */

import * as fs from 'node:fs';

import {
  type ArtifactCache,
  createArtifactCache,
  DEFAULT_CACHE_CONFIG,
  COMPACT_CACHE_CONFIG,
} from '@chessbeast/core';
import { EcoClient, LichessEliteClient } from '@chessbeast/database';
import { StockfishClient, MaiaClient, Stockfish16Client } from '@chessbeast/grpc-client';
import { OpenAIClient, createLLMConfig, type LLMConfigInput } from '@chessbeast/llm';

import type { ChessBeastConfig } from '../config/schema.js';
import { ServiceError, createServiceError, resolveAbsolutePath } from '../errors/index.js';
import type { ServiceStatus } from '../progress/reporter.js';

/**
 * Initialized services container
 */
export interface Services {
  stockfish: StockfishClient;
  sf16: Stockfish16Client | null;
  maia: MaiaClient | null;
  ecoClient: EcoClient | null;
  lichessClient: LichessEliteClient | null;
  /** Shared LLM client (null when LLM annotation is skipped); tests inject a mock here */
  llmClient: OpenAIClient | null;
  cache: ArtifactCache;
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
  const dbPath = config.databases.ecoPath;
  const absolutePath = resolveAbsolutePath(dbPath);
  if (fs.existsSync(absolutePath)) {
    return { name: 'ECO database', healthy: true };
  }
  return { name: 'ECO database', healthy: false, error: `file not found: ${absolutePath}` };
}

/**
 * Check if Lichess Elite database exists
 */
function checkLichessDatabase(config: ChessBeastConfig): ServiceStatus {
  const dbPath = config.databases.lichessPath;
  const absolutePath = resolveAbsolutePath(dbPath);
  if (fs.existsSync(absolutePath)) {
    return { name: 'Lichess Elite database', healthy: true };
  }
  return {
    name: 'Lichess Elite database',
    healthy: false,
    error: `file not found: ${absolutePath}`,
  };
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

  // Initialize Stockfish 16 (optional - for classical eval features)
  let sf16: Stockfish16Client | null = null;
  const sf16Config = config.services.stockfish16;
  if (sf16Config?.enabled !== false) {
    try {
      sf16 = new Stockfish16Client({
        host: sf16Config?.host ?? 'localhost',
        port: sf16Config?.port ?? 50053,
        timeoutMs: sf16Config?.timeoutMs ?? 30000,
      });
      const health = await sf16.healthCheck();
      if (!health.healthy) {
        // SF16 is optional - fall back gracefully
        sf16 = null;
      }
    } catch {
      // SF16 is optional - fall back gracefully without error
      sf16 = null;
    }
  }

  // Initialize ECO database (required)
  let ecoClient: EcoClient | null = null;
  const ecoAbsolutePath = resolveAbsolutePath(config.databases.ecoPath);
  if (fs.existsSync(ecoAbsolutePath)) {
    ecoClient = new EcoClient({ dbPath: ecoAbsolutePath });
  } else {
    throw new ServiceError(
      'ECO Database',
      `Database file not found: ${ecoAbsolutePath}`,
      "Run 'make setup' to download and set up the databases",
    );
  }

  // Initialize Lichess Elite database (required)
  let lichessClient: LichessEliteClient | null = null;
  const lichessAbsolutePath = resolveAbsolutePath(config.databases.lichessPath);
  if (fs.existsSync(lichessAbsolutePath)) {
    lichessClient = new LichessEliteClient({ dbPath: lichessAbsolutePath });
  } else {
    throw new ServiceError(
      'Lichess Database',
      `Database file not found: ${lichessAbsolutePath}`,
      "Run 'make setup' to download and set up the databases",
    );
  }

  // Initialize the shared LLM client (optional if skipLlm)
  let llmClient: OpenAIClient | null = null;
  if (!config.analysis.skipLlm) {
    if (!config.llm.apiKey) {
      throw new ServiceError(
        'OpenAI API',
        'API key not configured',
        'Set the OPENAI_API_KEY environment variable or use --skip-llm',
      );
    }
    const llmConfigInput: LLMConfigInput = {
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      temperature: config.llm.temperature,
      timeout: config.llm.timeout,
    };
    if (config.llm.reasoningEffort !== undefined) {
      llmConfigInput.reasoningEffort = config.llm.reasoningEffort;
    }
    if (config.llm.tokenBudget !== undefined) {
      llmConfigInput.budget = { maxTokensPerGame: config.llm.tokenBudget };
    }
    llmClient = new OpenAIClient(createLLMConfig(llmConfigInput));
  }

  // Initialize artifact cache based on analysis speed
  const cacheConfig =
    config.ultraFastCoach.speed === 'fast' ? COMPACT_CACHE_CONFIG : DEFAULT_CACHE_CONFIG;
  const cache = createArtifactCache(cacheConfig);

  return {
    stockfish,
    sf16,
    maia,
    ecoClient,
    lichessClient,
    llmClient,
    cache,
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
