/**
 * Limit constants for various operations
 * All values are in appropriate units (bytes, count, etc.)
 */

/**
 * Maximum payload size (100KB)
 * Used for API request payload validation
 */
export const MAX_PAYLOAD_SIZE = 100000;

/**
 * Maximum response size (1MB)
 * Used for API response size validation
 */
export const MAX_RESPONSE_SIZE = 1000000;

/**
 * Maximum batch size (10 requests)
 * Used for batching operations
 */
export const MAX_BATCH_SIZE = 10;

/**
 * Maximum retry attempts (3 attempts)
 * Used for retry logic in circuit breaker
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Maximum function complexity (10)
 * Used for code quality enforcement
 */
export const MAX_FUNCTION_COMPLEXITY = 10;

/**
 * Maximum lines per function (50)
 * Used for code quality enforcement
 */
export const MAX_LINES_PER_FUNCTION = 50;

/**
 * Maximum nesting depth (4 levels)
 * Used for code quality enforcement
 */
export const MAX_NESTING_DEPTH = 4;

/**
 * Maximum parameters per function (8)
 * Used for code quality enforcement
 */
export const MAX_FUNCTION_PARAMETERS = 8;

/**
 * Rate limiting - maximum requests per minute (60)
 */
export const MAX_REQUESTS_PER_MINUTE = 60;

/**
 * Rate limiting - maximum requests per hour (3600)
 */
export const MAX_REQUESTS_PER_HOUR = 3600;

/**
 * Circuit breaker failure threshold (5 failures)
 */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

/**
 * Default limits configuration object
 */
export const DEFAULT_LIMITS = {
  payloadSize: MAX_PAYLOAD_SIZE,
  responseSize: MAX_RESPONSE_SIZE,
  batchSize: MAX_BATCH_SIZE,
  retryAttempts: MAX_RETRY_ATTEMPTS,
  functionComplexity: MAX_FUNCTION_COMPLEXITY,
  linesPerFunction: MAX_LINES_PER_FUNCTION,
  nestingDepth: MAX_NESTING_DEPTH,
  functionParameters: MAX_FUNCTION_PARAMETERS,
  requestsPerMinute: MAX_REQUESTS_PER_MINUTE,
  requestsPerHour: MAX_REQUESTS_PER_HOUR,
  circuitBreakerFailures: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
} as const;

/**
 * Validate that a value is within specified limits
 */
export function validateLimit(value: number, limit: number, name: string): boolean {
  if (value > limit) {
    throw new Error(`${name} exceeds maximum limit of ${limit}: ${value}`);
  }
  return true;
}

/**
 * Check if a value is within limits without throwing
 */
export function isWithinLimit(value: number, limit: number): boolean {
  return value <= limit;
}
