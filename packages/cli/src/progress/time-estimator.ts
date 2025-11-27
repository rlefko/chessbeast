/**
 * Time estimation for analysis progress
 * Uses a rolling window average to estimate remaining time
 */

/**
 * Sample for progress tracking
 */
interface ProgressSample {
  timestamp: number;
  progress: number;
}

/**
 * Time estimator for analysis progress
 */
export class TimeEstimator {
  private samples: ProgressSample[] = [];
  private readonly windowSize: number;

  /**
   * Create a new time estimator
   * @param windowSize Number of samples to keep for rolling average (default: 10)
   */
  constructor(windowSize: number = 10) {
    this.windowSize = windowSize;
  }

  /**
   * Record a progress sample
   * @param progress Current progress value (e.g., moves completed)
   */
  record(progress: number): void {
    this.samples.push({
      timestamp: Date.now(),
      progress,
    });

    // Keep only the most recent samples
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /**
   * Estimate remaining time in milliseconds
   * @param currentProgress Current progress value
   * @param totalProgress Total progress value
   * @returns Estimated milliseconds remaining, or null if insufficient data
   */
  estimateRemaining(currentProgress: number, totalProgress: number): number | null {
    // Need at least 2 samples to calculate a rate
    if (this.samples.length < 2) {
      return null;
    }

    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;

    const timeDelta = last.timestamp - first.timestamp;
    const progressDelta = last.progress - first.progress;

    // No progress made or no time elapsed
    if (progressDelta <= 0 || timeDelta <= 0) {
      return null;
    }

    // Calculate rate: progress per millisecond
    const rate = progressDelta / timeDelta;
    const remaining = totalProgress - currentProgress;

    // Don't return negative estimates
    if (remaining <= 0) {
      return 0;
    }

    return Math.round(remaining / rate);
  }

  /**
   * Reset the estimator for a new phase
   */
  reset(): void {
    this.samples = [];
  }

  /**
   * Get the number of samples currently recorded
   */
  getSampleCount(): number {
    return this.samples.length;
  }
}
