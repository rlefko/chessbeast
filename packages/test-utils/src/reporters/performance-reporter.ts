/**
 * Performance benchmarking utilities
 *
 * Note: AnalysisProfile type is inlined to avoid circular dependency with @chessbeast/cli
 */

/**
 * Analysis profile presets (inlined to avoid circular dependency)
 */
export type AnalysisProfile = 'quick' | 'standard' | 'deep';

/**
 * Timing breakdown for a single analysis run
 */
export interface AnalysisTimings {
  total: number;
  parsing: number;
  shallowAnalysis: number;
  deepAnalysis: number;
  criticalMoments: number;
  maiaAnalysis: number;
  llmAnnotation: number;
  rendering: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
  peakMemoryMB: number;
  engineCalls: number;
  maiaCalls: number;
  llmCalls: number;
  llmTokensUsed: number;
}

/**
 * Complete benchmark result
 */
export interface BenchmarkResult {
  profile: AnalysisProfile;
  gameLength: number; // Number of plies
  iterations: number;
  timings: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    p50: number;
    p90: number;
    p99: number;
  };
  resources: ResourceMetrics;
}

/**
 * Benchmark summary across multiple games
 */
export interface BenchmarkSummary {
  profile: AnalysisProfile;
  totalGames: number;
  averageTimeMs: number;
  averageTimePerPly: number;
  totalEngineCalls: number;
  totalLlmTokens: number;
}

/**
 * Full benchmark report
 */
export interface BenchmarkReport {
  results: BenchmarkResult[];
  summary: {
    quick: BenchmarkSummary | null;
    standard: BenchmarkSummary | null;
    deep: BenchmarkSummary | null;
  };
  timestamp: string;
}

/**
 * Performance benchmark runner
 */
export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private startMemory: number = 0;

  /**
   * Start memory tracking
   */
  startMemoryTracking(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.startMemory = process.memoryUsage().heapUsed;
    }
  }

  /**
   * Get current memory usage delta
   */
  getMemoryDelta(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return (process.memoryUsage().heapUsed - this.startMemory) / (1024 * 1024);
    }
    return 0;
  }

  /**
   * Time a function execution
   */
  async timeExecution<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await fn();
    const timeMs = performance.now() - start;
    return { result, timeMs };
  }

  /**
   * Run a benchmark with multiple iterations
   */
  async runBenchmark(
    fn: () => Promise<{ gameLength: number; resources?: Partial<ResourceMetrics> }>,
    profile: AnalysisProfile,
    iterations: number = 5,
  ): Promise<BenchmarkResult> {
    const timings: number[] = [];
    let gameLength = 0;
    const resources: ResourceMetrics = {
      peakMemoryMB: 0,
      engineCalls: 0,
      maiaCalls: 0,
      llmCalls: 0,
      llmTokensUsed: 0,
    };

    this.startMemoryTracking();

    for (let i = 0; i < iterations; i++) {
      const { result, timeMs } = await this.timeExecution(fn);
      timings.push(timeMs);
      gameLength = result.gameLength;

      // Accumulate resource metrics
      if (result.resources) {
        resources.engineCalls += result.resources.engineCalls ?? 0;
        resources.maiaCalls += result.resources.maiaCalls ?? 0;
        resources.llmCalls += result.resources.llmCalls ?? 0;
        resources.llmTokensUsed += result.resources.llmTokensUsed ?? 0;
      }
    }

    resources.peakMemoryMB = this.getMemoryDelta();

    // Average resource metrics
    resources.engineCalls = Math.round(resources.engineCalls / iterations);
    resources.maiaCalls = Math.round(resources.maiaCalls / iterations);
    resources.llmCalls = Math.round(resources.llmCalls / iterations);
    resources.llmTokensUsed = Math.round(resources.llmTokensUsed / iterations);

    const result: BenchmarkResult = {
      profile,
      gameLength,
      iterations,
      timings: this.calculateStats(timings),
      resources,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Calculate timing statistics
   */
  private calculateStats(timings: number[]): BenchmarkResult['timings'] {
    const sorted = [...timings].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const variance = sorted.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const percentile = (p: number): number => {
      const index = Math.floor((p / 100) * n);
      return sorted[Math.min(index, n - 1)] ?? 0;
    };

    return {
      mean: Math.round(mean * 100) / 100,
      min: sorted[0] ?? 0,
      max: sorted[n - 1] ?? 0,
      stdDev: Math.round(stdDev * 100) / 100,
      p50: percentile(50),
      p90: percentile(90),
      p99: percentile(99),
    };
  }

  /**
   * Generate summary for a profile
   */
  private summarizeProfile(profile: AnalysisProfile): BenchmarkSummary | null {
    const profileResults = this.results.filter((r) => r.profile === profile);

    if (profileResults.length === 0) {
      return null;
    }

    const totalGames = profileResults.length;
    const totalTime = profileResults.reduce((sum, r) => sum + r.timings.mean, 0);
    const totalPlies = profileResults.reduce((sum, r) => sum + r.gameLength, 0);
    const totalEngineCalls = profileResults.reduce((sum, r) => sum + r.resources.engineCalls, 0);
    const totalLlmTokens = profileResults.reduce((sum, r) => sum + r.resources.llmTokensUsed, 0);

    return {
      profile,
      totalGames,
      averageTimeMs: totalTime / totalGames,
      averageTimePerPly: totalPlies > 0 ? totalTime / totalPlies : 0,
      totalEngineCalls,
      totalLlmTokens,
    };
  }

  /**
   * Generate full benchmark report
   */
  generateReport(): BenchmarkReport {
    return {
      results: [...this.results],
      summary: {
        quick: this.summarizeProfile('quick'),
        standard: this.summarizeProfile('standard'),
        deep: this.summarizeProfile('deep'),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate human-readable report
   */
  generateTextReport(): string {
    const report = this.generateReport();
    const lines: string[] = [
      '=== Performance Benchmark Report ===',
      `Timestamp: ${report.timestamp}`,
      '',
    ];

    // Individual results
    for (const result of report.results) {
      lines.push(`--- ${result.profile} profile (${result.gameLength} plies) ---`);
      lines.push(`  Mean:   ${result.timings.mean.toFixed(2)}ms`);
      lines.push(`  Min:    ${result.timings.min.toFixed(2)}ms`);
      lines.push(`  Max:    ${result.timings.max.toFixed(2)}ms`);
      lines.push(`  StdDev: ${result.timings.stdDev.toFixed(2)}ms`);
      lines.push(`  P90:    ${result.timings.p90.toFixed(2)}ms`);
      lines.push(`  Resources:`);
      lines.push(`    Engine calls: ${result.resources.engineCalls}`);
      lines.push(`    Maia calls:   ${result.resources.maiaCalls}`);
      lines.push(`    LLM tokens:   ${result.resources.llmTokensUsed}`);
      lines.push('');
    }

    // Summary
    lines.push('=== Summary ===');
    for (const profile of ['quick', 'standard', 'deep'] as const) {
      const summary = report.summary[profile];
      if (summary) {
        lines.push(
          `${profile}: ${summary.averageTimeMs.toFixed(2)}ms avg, ${summary.averageTimePerPly.toFixed(2)}ms/ply`,
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all results
   */
  reset(): void {
    this.results = [];
  }

  /**
   * Get all results
   */
  getResults(): BenchmarkResult[] {
    return [...this.results];
  }
}

/**
 * Create a new benchmark runner
 */
export function createBenchmarkRunner(): BenchmarkRunner {
  return new BenchmarkRunner();
}

/**
 * Time budget expectations per profile
 */
export const PROFILE_TIME_BUDGETS: Record<AnalysisProfile, { perPly: number; overhead: number }> = {
  quick: { perPly: 50, overhead: 500 }, // 50ms per ply + 500ms overhead
  standard: { perPly: 150, overhead: 1000 }, // 150ms per ply + 1s overhead
  deep: { perPly: 500, overhead: 2000 }, // 500ms per ply + 2s overhead
};

/**
 * Get expected max time for a game
 */
export function getExpectedMaxTime(profile: AnalysisProfile, plyCount: number): number {
  const budget = PROFILE_TIME_BUDGETS[profile];
  return budget.perPly * plyCount + budget.overhead;
}
