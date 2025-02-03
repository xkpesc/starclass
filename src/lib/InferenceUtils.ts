export class TokenEntropyMonitor {
  private entropyWindow: number[];
  private readonly maxWindowSize: number;
  public readonly entropyThreshold: number;
  /**
   * Creates an instance of the TokenEntropyMonitor.
   * @param windowSize - The size of the window for tracking entropy. Default is 5.
   * @param entropyThreshold - The threshold for detecting high variance in entropy. Default is 1.5.
   */

  constructor(windowSize = 30, entropyThreshold = 1.5) {
    this.entropyWindow = [];
    this.maxWindowSize = windowSize;
    this.entropyThreshold = entropyThreshold;
  }

  /**
   * Computes entropy from an array of log probabilities.
   * Uses the formula: H = -Σ p * log(p), where p = exp(logProb)/Σ exp(logProb)
   * @param logProbs Array of log probabilities for top tokens
   * @returns Entropy
   */
  public computeEntropy(logProbs: number[]): number {
    // Filter out any -Infinity (invalid) entries
    const validLogProbs = logProbs.filter(logP => logP > -Infinity);
    if (validLogProbs.length === 0) {
      return 0;
    }

    // Convert log-probs to probabilities and normalize
    const probs = validLogProbs.map(lp => Math.exp(lp));
    const sumProbs = probs.reduce((a, b) => a + b, 0);
    const normalizedProbs = probs.map(p => p / sumProbs);

    // Compute entropy: H = -Σ p * log(p)
    const entropy = -normalizedProbs.reduce((acc, p) => {
      return acc + (p > 0 ? p * Math.log(p) : 0);
    }, 0);

    return entropy;
  }

  /**
   * Gets the current standard deviation of the entropy window
   * @returns Current rolling standard deviation or 0 if window not full
   */
  private getCurrentStdDev(): number {
    const n = this.entropyWindow.length;
    if (n === 0) return 0;
    const mean = this.entropyWindow.reduce((a, b) => a + b, 0) / n;
    const variance = this.entropyWindow.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / n;
    return Math.sqrt(variance);
  }

  /**
   * Updates entropy history and detects anomalies
   * @param logProbs Log probabilities from current token
   * @returns True if potential hallucination detected
   */
  detectHallucination(logProbs: number[]): boolean {
    if (logProbs.length === 0) return false;
    
    const entropy = this.computeEntropy(logProbs);
    console.log(`Current token entropy: ${entropy.toFixed(4)}`);
    
    this.entropyWindow.push(entropy);
    
    if (this.entropyWindow.length > this.maxWindowSize) {
      this.entropyWindow.shift();
    }

    const stdDev = this.getCurrentStdDev();
    console.log(`Rolling entropy stddev: ${stdDev.toFixed(4)}`);
    
    return stdDev > this.entropyThreshold;
  }
} 