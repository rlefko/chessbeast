/**
 * Fixture loading utilities for tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the absolute path to the fixtures directory
 * Works whether running from src or dist
 */
function getFixturesRoot(): string {
  // When compiled, __dirname is dist/fixtures
  // When running from src, __dirname is src/fixtures
  // We need to find the src/fixtures/games directory

  // Check if we're in dist (compiled)
  if (__dirname.includes('/dist/')) {
    // Navigate from dist/fixtures to src/fixtures
    const packageRoot = path.resolve(__dirname, '..', '..');
    return path.join(packageRoot, 'src', 'fixtures', 'games');
  }

  // We're in src
  return path.join(__dirname, 'games');
}

/**
 * Get the absolute path to a fixture file
 */
export function getFixturePath(relativePath: string): string {
  return path.join(getFixturesRoot(), relativePath);
}

/**
 * Load a PGN fixture file
 */
export async function loadPgn(relativePath: string): Promise<string> {
  const fullPath = getFixturePath(relativePath);
  return fs.promises.readFile(fullPath, 'utf-8');
}

/**
 * Load a PGN fixture file synchronously
 */
export function loadPgnSync(relativePath: string): string {
  const fullPath = getFixturePath(relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Load a JSON fixture file
 */
export async function loadJson<T>(relativePath: string): Promise<T> {
  const fullPath = getFixturePath(relativePath);
  const content = await fs.promises.readFile(fullPath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Load a JSON fixture file synchronously
 */
export function loadJsonSync<T>(relativePath: string): T {
  const fullPath = getFixturePath(relativePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * List all PGN fixtures in a directory
 */
export function listPgnFixtures(directory: string): string[] {
  const fullPath = getFixturePath(directory);
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  return fs
    .readdirSync(fullPath)
    .filter((f) => f.endsWith('.pgn'))
    .map((f) => path.join(directory, f));
}

/**
 * Check if a fixture exists
 */
export function fixtureExists(relativePath: string): boolean {
  return fs.existsSync(getFixturePath(relativePath));
}
