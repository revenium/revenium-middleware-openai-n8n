/**
 * Timeout constants for various operations
 * All values are in milliseconds
 */

/**
 * Model invocation timeout (2.5 minutes)
 * Used for OpenAI API calls and model operations
 */
export const MODEL_INVOCATION_TIMEOUT = 150000;

/**
 * Tool execution timeout (15 seconds)
 * Used for individual tool operations
 */
export const TOOL_EXECUTION_TIMEOUT = 15000;

/**
 * Stream timeout (1 minute)
 * Used for streaming operations and real-time data
 */
export const STREAM_TIMEOUT = 60000;

/**
 * API timeout (10 seconds)
 * Used for general API calls and HTTP requests
 */
export const API_TIMEOUT = 10000;

/**
 * Batch processing timeout (5 seconds)
 * Used for batch queue processing intervals
 */
export const BATCH_PROCESSING_TIMEOUT = 5000;

/**
 * Circuit breaker timeout (30 seconds)
 * Used for circuit breaker half-open state duration
 */
export const CIRCUIT_BREAKER_TIMEOUT = 30000;

/**
 * Retry delay timeout (1 second)
 * Used for retry delays between failed requests
 */
export const RETRY_DELAY_TIMEOUT = 1000;

/**
 * Default timeout configuration object
 */
export const DEFAULT_TIMEOUTS = {
  modelInvocation: MODEL_INVOCATION_TIMEOUT,
  toolExecution: TOOL_EXECUTION_TIMEOUT,
  streamTimeout: STREAM_TIMEOUT,
  apiTimeout: API_TIMEOUT,
  batchProcessing: BATCH_PROCESSING_TIMEOUT,
  circuitBreaker: CIRCUIT_BREAKER_TIMEOUT,
  retryDelay: RETRY_DELAY_TIMEOUT,
} as const;

/**
 * Environment variable timeout configuration with fallbacks
 */
export function getTimeoutFromEnv(envVar: string, defaultValue: number): number {
  const value = process.env[envVar];
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`Invalid timeout value for ${envVar}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  
  return parsed;
}
