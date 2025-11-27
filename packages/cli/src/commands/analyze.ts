/**
 * Analyze command implementation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { parseCliOptions, VERSION } from '../cli.js';
import { loadConfig, formatConfig } from '../config/loader.js';
import { InputError, OutputError, handleError, resolveAbsolutePath } from '../errors/index.js';
import { orchestrateAnalysis } from '../orchestrator/orchestrator.js';
import {
  performHealthChecks,
  initializeServices,
  closeServices,
} from '../orchestrator/services.js';
import { formatConfigDisplay } from '../progress/formatters.js';
import { ProgressReporter } from '../progress/reporter.js';

/**
 * Read PGN input from file or stdin
 */
async function readInput(inputPath: string | undefined): Promise<string> {
  if (inputPath) {
    // Read from file
    if (!fs.existsSync(inputPath)) {
      throw new InputError(
        `Input file not found: ${inputPath}`,
        'Check the file path and try again',
      );
    }
    return fs.readFileSync(inputPath, 'utf-8');
  }

  // Read from stdin
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      chunks.push(line);
    });

    rl.on('close', () => {
      resolve(chunks.join('\n'));
    });

    rl.on('error', (err) => {
      reject(new InputError(`Failed to read from stdin: ${err.message}`));
    });

    // Check if stdin is a TTY (no piped input)
    if (process.stdin.isTTY) {
      reject(
        new InputError(
          'No input provided',
          'Provide a PGN file with --input or pipe PGN data to stdin',
        ),
      );
    }
  });
}

/**
 * Write output to file or stdout
 */
function writeOutput(output: string, outputPath: string | undefined): void {
  if (outputPath) {
    try {
      fs.writeFileSync(outputPath, output, 'utf-8');
    } catch (error) {
      throw new OutputError(
        `Failed to write output file: ${outputPath}`,
        error instanceof Error ? error.message : 'unknown error',
      );
    }
  } else {
    process.stdout.write(output);
  }
}

/**
 * Main analyze command handler
 */
export async function analyzeCommand(rawOptions: Record<string, unknown>): Promise<void> {
  const options = parseCliOptions(rawOptions);
  const reporter = new ProgressReporter({
    color: !options.noColor,
  });

  try {
    // Load configuration
    const config = await loadConfig(options);

    // Show config and exit if requested
    if (options.showConfig) {
      console.log(formatConfigDisplay(config));
      console.log('');
      console.log('Raw configuration:');
      console.log(formatConfig(config));
      return;
    }

    // Print header
    reporter.printHeader(VERSION);

    // Perform health checks
    const healthStatus = await performHealthChecks(config);
    reporter.reportServiceStatus(healthStatus);

    // Dry-run mode: validate setup without running analysis
    if (options.dryRun) {
      reporter.printMessage('');
      reporter.printMessage('Dry-run mode: validating setup...');
      reporter.printMessage('');

      const allHealthy = healthStatus.every((s) => s.healthy);

      if (allHealthy) {
        reporter.printSuccess('All services healthy. Ready to analyze.');
      } else {
        reporter.printWarning('Some services unavailable:');
        for (const service of healthStatus.filter((s) => !s.healthy)) {
          reporter.printMessage(`  - ${service.name}: ${service.error}`);
        }
      }

      // Validate input file exists (if provided)
      if (options.input) {
        const inputPath = resolveAbsolutePath(options.input);
        if (fs.existsSync(inputPath)) {
          reporter.printSuccess(`Input file exists: ${inputPath}`);
        } else {
          reporter.printError(`Input file not found: ${inputPath}`);
        }
      }

      // Validate output directory exists (if provided)
      if (options.output) {
        const outputPath = resolveAbsolutePath(options.output);
        const outputDir = path.dirname(outputPath);
        if (fs.existsSync(outputDir)) {
          reporter.printSuccess(`Output directory exists: ${outputDir}`);
        } else {
          reporter.printWarning(`Output directory does not exist: ${outputDir}`);
        }
      }

      reporter.printMessage('');
      reporter.printMessage('Dry-run complete. No analysis was performed.');
      return;
    }

    // Check for required service failures
    const failedRequired = healthStatus.filter((s) => !s.healthy);
    if (failedRequired.length > 0) {
      // Let initializeServices handle the error with proper suggestions
    }

    // Initialize services
    const services = await initializeServices(config);

    try {
      // Read input
      const pgnInput = await readInput(options.input);

      // Run analysis
      reporter.startAnalysis();
      const { results, stats } = await orchestrateAnalysis(pgnInput, config, services, reporter);

      // Combine all annotated PGNs
      const output = results.map((r) => r.annotatedPgn).join('\n\n');

      // Write output
      writeOutput(output, options.output);

      // Print summary
      reporter.printSummary(stats);

      // Print output location if writing to file
      if (options.output) {
        reporter.printOutputLocation(options.output);
      }
    } finally {
      // Clean up services
      closeServices(services);
    }
  } catch (error) {
    reporter.stop();
    handleError(error);
  }
}
