/**
 * Circuit breaker state for tracking API failures
 */
export interface CircuitBreakerState {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }
  
  /**
   * Circuit breaker configuration
   */
export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
}