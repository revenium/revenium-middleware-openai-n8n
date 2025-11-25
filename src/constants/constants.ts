import { INodePropertyOptions } from "n8n-workflow";
import { BatchConfig, CircuitBreakerConfig, CircuitBreakerState, RateLimitConfig, RateLimitState } from "../types/index.js";  
import { CIRCUIT_BREAKER_FAILURE_THRESHOLD, MAX_BATCH_SIZE, MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_MINUTE, MAX_RETRY_ATTEMPTS } from "./limits.js";
import { BATCH_PROCESSING_TIMEOUT, RETRY_DELAY_TIMEOUT, CIRCUIT_BREAKER_TIMEOUT } from "./timeouts.js";

export const MIN_TIMEOUT: number = 1000;
export const MAX_TIMEOUT: number = 600000;

/**
 * Allowed base URLs for Revenium API endpoints
 * This prevents SSRF attacks by restricting to known safe endpoints
 */
export const ALLOWED_REVENIUM_BASE_URLS: string[] = [
  'https://api.revenium.ai',
  'https://api.dev.hcapp.io',
  'https://api.prod.hcapp.io',
  'https://api.qa.hcapp.io',
  // Add other legitimate Revenium endpoints as needed
];

/**
 * Allowed base URLs for OpenAI API endpoints
 * This prevents SSRF attacks by restricting to known safe endpoints
 */
export const ALLOWED_OPENAI_BASE_URLS: string[] = [
  'https://api.openai.com/v1',
  'https://api.openai.com',
  // Add other legitimate OpenAI endpoints as needed
];


/**
 * Default batch configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchSize: MAX_BATCH_SIZE  ,
  flushIntervalMs: BATCH_PROCESSING_TIMEOUT,
  maxWaitTimeMs: 30000 // 30 seconds max wait
};

/**
 * Global circuit breaker state for Revenium API
 */
export const reveniumCircuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED'
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  recoveryTimeoutMs: CIRCUIT_BREAKER_TIMEOUT,
  maxRetries: MAX_RETRY_ATTEMPTS,
  retryDelayMs: RETRY_DELAY_TIMEOUT
};

/**
 * Global rate limiting state
 */
export const rateLimitState: RateLimitState = {
  requestsThisMinute: 0,
  requestsThisHour: 0,
  minuteWindowStart: Date.now(),
  hourWindowStart: Date.now()
};  

/**
 * Default rate limiting configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
  maxRequestsPerHour: MAX_REQUESTS_PER_HOUR
};

/**
 * Model priority mapping for sorting
 */
export const MODEL_PRIORITIES: Record<string, number> = {
  'gpt-4o': 1,
  'gpt-4o-mini': 2,
  'gpt-4-turbo': 3,
  'gpt-4': 4,
  'gpt-3.5-turbo': 5,
  'gpt-3.5-turbo-16k': 6,
};

/**
 * Fallback models when API is unavailable
 */
export const FALLBACK_MODELS: INodePropertyOptions[] = [
  { name: 'GPT-4o (Latest)', value: 'gpt-4o' },
  { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  { name: 'GPT-4', value: 'gpt-4' },
  { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
];
