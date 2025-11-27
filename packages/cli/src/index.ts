#!/usr/bin/env node

/**
 * ChessBeast CLI - AI Chess Annotator
 *
 * Main entry point for the chessbeast command-line interface.
 */

import { createProgram } from './cli.js';
import { handleError } from './errors/index.js';

export { VERSION } from './cli.js';

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  try {
    const program = createProgram();
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }
}

// Run if executed directly
main().catch(handleError);
