/**
 * Core utility functions for Revenium middleware
 */

import {
  ALLOWED_REVENIUM_BASE_URLS,
  ALLOWED_OPENAI_BASE_URLS,
  DEFAULT_BATCH_CONFIG,
  reveniumCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  rateLimitState,
} from '../constants/constants.js';
import {
  MODEL_INVOCATION_TIMEOUT,
  TOOL_EXECUTION_TIMEOUT,
  STREAM_TIMEOUT,
  API_TIMEOUT,
  getTimeoutFromEnv,
} from '../constants/timeouts.js';
import type {
  OpenAIFinishReason,
  ReveniumStopReason,
  CreateCompletionRequest,
  CreateCompletionResponse,
  UsageMetadata,
  ReveniumConfig,
  ReveniumError,
  ReveniumOpenAICredentials,
  SubscriberInfo,
  BatchedRequest,
  CircuitBreakerConfig,
  RateLimitConfig,
} from '../types/index.js';

import { logger } from './logger.js';

export {
  extractPrompts,
  shouldCapturePrompts,
  sanitizeCredentials,
  getMaxPromptSize,
  type PromptData,
} from './prompt-extraction.js';

/**
 * Configuration for timeout values
 */
export interface TimeoutConfig {
  modelInvocation: number;
  toolExecution: number;
  streamTimeout: number;
  apiTimeout: number;
}

/**
 * Get timeout configuration from environment variables with fallbacks
 */
export function getTimeoutConfig(): TimeoutConfig {
  return {
    modelInvocation: getTimeoutFromEnv(
      'REVENIUM_MODEL_TIMEOUT',
      MODEL_INVOCATION_TIMEOUT
    ),
    toolExecution: getTimeoutFromEnv(
      'REVENIUM_TOOL_TIMEOUT',
      TOOL_EXECUTION_TIMEOUT
    ),
    streamTimeout: getTimeoutFromEnv('REVENIUM_STREAM_TIMEOUT', STREAM_TIMEOUT),
    apiTimeout: getTimeoutFromEnv('REVENIUM_API_TIMEOUT', API_TIMEOUT),
  };
}

/**
 * Generate a correlation ID for tracking operations
 */
export function generateCorrelationId(): string {
  return `revenium-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Global batch queue for Revenium requests
 */
let batchQueue: BatchedRequest[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let isProcessingBatch = false;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if circuit breaker should allow the request
 */
function shouldAllowRequest(config: CircuitBreakerConfig): boolean {
  const now = Date.now();

  switch (reveniumCircuitBreaker.state) {
    case 'CLOSED':
      return true;
    case 'OPEN':
      if (
        now - reveniumCircuitBreaker.lastFailureTime >
        config.recoveryTimeoutMs
      ) {
        reveniumCircuitBreaker.state = 'HALF_OPEN';
        return true;
      }
      return false;
    case 'HALF_OPEN':
      return true;
    default:
      return true;
  }
}

/**
 * Record a successful API call
 */
function recordSuccess(): void {
  reveniumCircuitBreaker.failures = 0;
  reveniumCircuitBreaker.state = 'CLOSED';
}

/**
 * Record a failed API call
 */
function recordFailure(config: CircuitBreakerConfig): void {
  reveniumCircuitBreaker.failures++;
  reveniumCircuitBreaker.lastFailureTime = Date.now();

  if (reveniumCircuitBreaker.failures >= config.failureThreshold) {
    reveniumCircuitBreaker.state = 'OPEN';
    logger.warning(
      'Revenium API circuit breaker opened due to %d failures',
      reveniumCircuitBreaker.failures
    );
  }
}

/**
 * Process the current batch of requests
 */
async function processBatch(): Promise<void> {
  if (isProcessingBatch || batchQueue.length === 0) return;

  isProcessingBatch = true;
  const currentBatch = [...batchQueue];
  batchQueue = [];

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  logger.debug('Processing batch of %d Revenium requests', currentBatch.length);

  // Group requests by config (API key + base URL)
  const requestGroups = new Map<string, BatchedRequest[]>();

  for (const item of currentBatch) {
    const key = `${item.config.apiKey}:${item.config.baseUrl}`;
    if (!requestGroups.has(key)) {
      requestGroups.set(key, []);
    }
    requestGroups.get(key)!.push(item);
  }

  // Process each group separately
  for (const [, requests] of requestGroups) {
    await processBatchGroup(requests);
  }

  isProcessingBatch = false;
}

/**
 * Process a group of requests with the same configuration
 */
async function processBatchGroup(requests: BatchedRequest[]): Promise<void> {
  if (requests.length === 0) return;
  const config = requests[0]!.config;
  const circuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG;

  // Check circuit breaker for this config
  if (!shouldAllowRequest(circuitBreakerConfig)) {
    logger.warning(
      'Revenium API circuit breaker is open, rejecting batch of %d requests',
      requests.length
    );
    requests.forEach(item => {
      item.reject(new Error('Circuit breaker is open'));
    });
    return;
  }

  // For now, process requests individually but in parallel
  // Future enhancement: implement true batch API endpoint
  const promises = requests.map(async item => {
    try {
      await createCompletionWithRetry(
        item.request,
        config,
        circuitBreakerConfig
      );
      logger.debug(
        'Batch request completed successfully for transaction: %s',
        item.request.transactionId
      );
      item.resolve();
    } catch (error) {
      logger.error(
        'Batch request failed for transaction %s: %s',
        item.request.transactionId,
        error instanceof Error ? error.message : String(error)
      );
      logger.debug('Full batch error details: %O', error);
      item.reject(error);
    }
  });

  await Promise.allSettled(promises);
}

/**
 * Create completion with retry logic
 */
async function createCompletionWithRetry(
  request: CreateCompletionRequest,
  config: ReveniumConfig,
  circuitBreakerConfig: CircuitBreakerConfig
): Promise<void> {
  for (let attempt = 1; attempt <= circuitBreakerConfig.maxRetries; attempt++) {
    try {
      await createCompletion(request, config);
      recordSuccess();
      return;
    } catch (error) {
      if (attempt === circuitBreakerConfig.maxRetries) {
        recordFailure(circuitBreakerConfig);
        throw error;
      } else {
        await sleep(circuitBreakerConfig.retryDelayMs);
      }
    }
  }
}

/**
 * Schedule batch processing
 */
function scheduleBatchProcessing(): void {
  if (batchTimer) return;

  batchTimer = setTimeout(() => {
    processBatch().catch(error => {
      logger.error(
        'Error processing batch: %s',
        error instanceof Error ? error.message : String(error)
      );
    });
  }, DEFAULT_BATCH_CONFIG.flushIntervalMs);
}

/**
 * Add request to batch queue
 */
function addToBatch(
  request: CreateCompletionRequest,
  config: ReveniumConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    const batchedRequest: BatchedRequest = {
      request,
      config,
      timestamp: Date.now(),
      resolve,
      reject,
    };

    batchQueue.push(batchedRequest);

    // Check if we should flush immediately
    if (batchQueue.length >= DEFAULT_BATCH_CONFIG.maxBatchSize) {
      // Process immediately when batch is full
      setImmediate(() => {
        processBatch().catch(error => {
          logger.error(
            'Error processing full batch: %s',
            error instanceof Error ? error.message : String(error)
          );
        });
      });
    } else {
      // Schedule processing if not already scheduled
      scheduleBatchProcessing();
    }

    // Check for old requests that should be flushed
    const now = Date.now();
    const hasOldRequests = batchQueue.some(
      item => now - item.timestamp > DEFAULT_BATCH_CONFIG.maxWaitTimeMs
    );

    if (hasOldRequests) {
      setImmediate(() => {
        processBatch().catch(error => {
          logger.error(
            'Error processing aged batch: %s',
            error instanceof Error ? error.message : String(error)
          );
        });
      });
    }
  });
}

/**
 * Enhanced error context for better debugging
 */
export interface ErrorContext {
  correlationId: string;
  operation: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validates a URL against security criteria and allowlist
 * @param url - URL to validate
 * @param allowedUrls - Array of allowed base URLs
 * @param urlType - Type of URL for error messages
 * @returns true if valid, throws error if invalid
 */
export function validateSecureUrl(
  url: string,
  allowedUrls: string[],
  urlType: string
): boolean {
  if (!url || typeof url !== 'string')
    throw new Error(`Invalid ${urlType}: URL must be a non-empty string`);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid ${urlType}: URL format is invalid`);
  }

  // Only allow HTTPS for security
  if (parsedUrl.protocol !== 'https:')
    throw new Error(`Invalid ${urlType}: Only HTTPS URLs are allowed`);

  // Check against allowlist
  const isAllowed = allowedUrls.some(allowedUrl => {
    try {
      const allowedParsed = new URL(allowedUrl);
      return (
        parsedUrl.hostname === allowedParsed.hostname &&
        (url.startsWith(allowedUrl) || allowedUrl.startsWith(url))
      );
    } catch {
      return false;
    }
  });

  if (!isAllowed) {
    throw new Error(
      `Invalid ${urlType}: URL not in allowlist. Allowed domains: ${allowedUrls.map(u => new URL(u).hostname).join(', ')}`
    );
  }

  return true;
}

/**
 * Validates API key format and basic security requirements
 * @param apiKey - API key to validate
 * @param keyType - Type of API key for error messages
 * @returns true if valid, throws error if invalid
 */
export function validateApiKey(apiKey: string, keyType: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error(`Invalid ${keyType}: API key must be a non-empty string`);
  }

  // Remove whitespace
  const trimmedKey = apiKey.trim();

  if (trimmedKey.length === 0) {
    throw new Error(
      `Invalid ${keyType}: API key cannot be empty or only whitespace`
    );
  }

  // Basic length validation (most API keys are at least 20 characters)
  if (trimmedKey.length < 20) {
    throw new Error(
      `Invalid ${keyType}: API key appears too short (minimum 20 characters)`
    );
  }

  // Check for common placeholder values
  const placeholders = [
    'your-api-key',
    'api-key-here',
    'replace-me',
    'test',
    'demo',
    'example',
  ];
  if (
    placeholders.some(placeholder =>
      trimmedKey.toLowerCase().includes(placeholder)
    )
  ) {
    throw new Error(
      `Invalid ${keyType}: API key appears to be a placeholder value`
    );
  }

  // OpenAI specific validation
  if (
    keyType.toLowerCase().includes('openai') &&
    !trimmedKey.startsWith('sk-')
  ) {
    throw new Error(
      `Invalid ${keyType}: OpenAI API keys must start with 'sk-'`
    );
  }

  return true;
}

/**
 * Validates model name format and security
 * @param modelName - Model name to validate
 * @returns true if valid, throws error if invalid
 */
export function validateModelName(modelName: string): boolean {
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Invalid model name: must be a non-empty string');
  }

  const trimmedName = modelName.trim();

  if (trimmedName.length === 0) {
    throw new Error('Invalid model name: cannot be empty or only whitespace');
  }

  // Basic format validation - alphanumeric, hyphens, underscores, dots
  const validModelNameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!validModelNameRegex.test(trimmedName)) {
    throw new Error(
      'Invalid model name: can only contain letters, numbers, dots, hyphens, and underscores'
    );
  }

  // Length validation
  if (trimmedName.length > 100) {
    throw new Error('Invalid model name: maximum length is 100 characters');
  }

  return true;
}

/**
 * Validates numeric parameters with range checking
 * @param value - Value to validate
 * @param paramName - Parameter name for error messages
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @param allowUndefined - Whether undefined values are allowed
 * @returns true if valid, throws error if invalid
 */
export function validateNumericParameter(
  value: unknown,
  paramName: string,
  min: number,
  max: number,
  allowUndefined: boolean = false
): boolean {
  // Check for undefined/null first
  if (value === undefined || value === null) {
    if (allowUndefined) return true;
    throw new Error(`Invalid ${paramName}: parameter is required`);
  }

  if (typeof value !== 'number') {
    throw new Error(`Invalid ${paramName}: must be a number`);
  }

  if (isNaN(value) || !isFinite(value)) {
    throw new Error(`Invalid ${paramName}: must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(`Invalid ${paramName}: must be between ${min} and ${max}`);
  }

  return true;
}

/**
 * Validates timeout values with reasonable limits
 * @param timeout - Timeout value in milliseconds
 * @param allowUndefined - Whether undefined values are allowed
 * @returns true if valid, throws error if invalid
 */
export function validateTimeout(
  timeout: unknown,
  allowUndefined: boolean = true
): boolean {
  // Check for undefined/null first
  if (timeout === undefined || timeout === null) {
    if (allowUndefined) return true;
    throw new Error('Invalid timeout: parameter is required');
  }

  if (typeof timeout !== 'number') {
    throw new Error('Invalid timeout: must be a number (milliseconds)');
  }

  if (isNaN(timeout) || !isFinite(timeout)) {
    throw new Error('Invalid timeout: must be a finite number');
  }

  if (timeout < 0) {
    throw new Error('Invalid timeout: cannot be negative');
  }

  // Reasonable upper limit (24 hours)
  if (timeout > 24 * 60 * 60 * 1000) {
    throw new Error('Invalid timeout: cannot exceed 24 hours');
  }

  return true;
}

/**
 * Map OpenAI finish reasons to Revenium stop reasons
 * Matches Python implementation
 */
export function getStopReason(
  openaiFinishReason?: OpenAIFinishReason
): ReveniumStopReason {
  const finishReasonMap: Record<string, ReveniumStopReason> = {
    stop: 'END',
    function_call: 'END_SEQUENCE',
    tool_calls: 'END_SEQUENCE',
    timeout: 'TIMEOUT',
    length: 'TOKEN_LIMIT',
    content_filter: 'ERROR',
  };

  return finishReasonMap[openaiFinishReason || ''] || 'END';
}

function sanitizeStringField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildSubscriberObject(
  usageMetadata: UsageMetadata
): SubscriberInfo | undefined {
  const id = sanitizeStringField(
    usageMetadata.subscriberId || usageMetadata.subscriber_id
  );
  const email = sanitizeStringField(
    usageMetadata.subscriberEmail || usageMetadata.subscriber_email
  );
  const credentialName = sanitizeStringField(
    usageMetadata.subscriberCredentialName ||
      usageMetadata.subscriber_credential_name
  );
  const credentialValue = sanitizeStringField(
    usageMetadata.subscriberCredential || usageMetadata.subscriber_credential
  );

  if (!id && !email && !credentialName && !credentialValue) {
    return undefined;
  }

  const subscriber: SubscriberInfo = {};

  if (id) subscriber.id = id;
  if (email) subscriber.email = email;

  if (credentialName && credentialValue) {
    subscriber.credential = {
      name: credentialName,
      value: credentialValue,
    };
  }

  return subscriber;
}

/**
 * Validate metering prerequisites and get configuration
 */
function validateMeteringPrerequisites(
  config?: ReveniumConfig
): { apiKey: string; baseUrl: string } | null {
  const apiKey = config?.apiKey || process.env.REVENIUM_METERING_API_KEY;
  const baseUrl =
    config?.baseUrl ||
    process.env.REVENIUM_METERING_BASE_URL ||
    'https://api.revenium.ai';

  if (!apiKey) {
    logger.warning(
      'Skipping metering call: REVENIUM_METERING_API_KEY not provided'
    );
    return null;
  }

  const circuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG;

  // Check circuit breaker
  if (!shouldAllowRequest(circuitBreakerConfig)) {
    logger.warning(
      'Revenium API circuit breaker is open, skipping usage logging'
    );
    return null;
  }

  // Check rate limits
  if (!checkRateLimit()) {
    logger.warning('Rate limit exceeded, skipping usage logging');
    return null;
  }

  return { apiKey, baseUrl };
}

/**
 * Determine provider from system fingerprint
 */
function determineProvider(systemFingerprint?: string): 'OLLAMA' | 'OPENAI' {
  const provider = systemFingerprint === 'fp_ollama' ? 'OLLAMA' : 'OPENAI';
  logger.debug(
    'Determined provider: %s based on system_fingerprint: %s',
    provider,
    systemFingerprint
  );
  return provider;
}

/**
 * Build completion request payload
 */
function buildCompletionRequest(
  responseId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  cachedTokens: number,
  stopReason: ReveniumStopReason,
  requestTime: string,
  responseTime: string,
  requestDuration: number,
  usageMetadata: UsageMetadata,
  provider: 'OLLAMA' | 'OPENAI',
  isStreamed: boolean,
  timeToFirstToken: number
): CreateCompletionRequest {
  const subscriber = buildSubscriberObject(usageMetadata);
  if (subscriber) {
    logger.debug('Built subscriber object: %O', subscriber);
  } else {
    logger.debug('No subscriber metadata provided');
  }

  const taskType = sanitizeStringField(
    usageMetadata.taskType || usageMetadata.task_type
  );
  const agent = sanitizeStringField(usageMetadata.agent);
  const organizationId = sanitizeStringField(
    usageMetadata.organizationId || usageMetadata.organization_id
  );
  const productId = sanitizeStringField(
    usageMetadata.productId || usageMetadata.product_id
  );
  const subscriptionId = sanitizeStringField(
    usageMetadata.subscriptionId || usageMetadata.subscription_id
  );
  const traceId = sanitizeStringField(
    usageMetadata.traceId || usageMetadata.trace_id
  );

  const safeRequestDuration = Math.round(requestDuration);
  const safeTimeToFirstToken = Math.round(timeToFirstToken);

  if (!Number.isFinite(safeRequestDuration) || safeRequestDuration < 0) {
    logger.warning('Invalid requestDuration: %s, using 0', requestDuration);
  }

  if (!Number.isFinite(safeTimeToFirstToken) || safeTimeToFirstToken < 0) {
    logger.warning('Invalid timeToFirstToken: %s, using 0', timeToFirstToken);
  }

  return {
    stopReason,
    costType: 'AI',
    isStreamed,
    operationType: 'CHAT',
    inputTokenCount: promptTokens,
    outputTokenCount: completionTokens,
    reasoningTokenCount: 0,
    cacheCreationTokenCount: cachedTokens,
    cacheReadTokenCount: 0,
    totalTokenCount: totalTokens,
    middlewareSource: 'n8n',
    ...(subscriber ? { subscriber } : {}),
    model,
    transactionId: responseId,
    responseTime,
    requestDuration:
      Number.isFinite(safeRequestDuration) && safeRequestDuration >= 0
        ? safeRequestDuration
        : 0,
    provider,
    requestTime,
    completionStartTime: responseTime,
    timeToFirstToken:
      Number.isFinite(safeTimeToFirstToken) && safeTimeToFirstToken >= 0
        ? safeTimeToFirstToken
        : 0,
    ...(taskType ? { taskType } : {}),
    ...(agent ? { agent } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(productId ? { productId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(usageMetadata.responseQualityScore !== undefined &&
    Number.isFinite(usageMetadata.responseQualityScore)
      ? { responseQualityScore: usageMetadata.responseQualityScore }
      : {}),
  };
}

/**
 * Execute metering request (direct or batched)
 */
async function executeMeteringRequest(
  completionRequest: CreateCompletionRequest,
  apiKey: string,
  baseUrl: string
): Promise<void> {
  const circuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG;

  // In test mode, make direct API call with retry logic instead of batching
  if (isTestMode) {
    try {
      await createCompletionWithRetry(
        completionRequest,
        { apiKey, baseUrl },
        circuitBreakerConfig
      );
      logger.debug(
        'Metering call completed directly with retry logic (test mode)'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warning('Error making direct metering call: %s', errorMessage);
      logger.debug('Full error details: %O', error);
    }
  } else {
    // Add request to batch queue for processing
    try {
      await addToBatch(completionRequest, { apiKey, baseUrl });
      logger.debug('Metering call queued for batch processing');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warning(
        'Error queuing metering call for batch processing: %s',
        errorMessage
      );
      logger.debug('Full error details: %O', error);
    }
  }
}

/**
 * Log token usage to Revenium API
 * Fire-and-forget async function matching Python implementation
 */
export async function logTokenUsage(
  responseId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  cachedTokens: number,
  stopReason: ReveniumStopReason,
  requestTime: string,
  responseTime: string,
  requestDuration: number,
  usageMetadata: UsageMetadata,
  systemFingerprint?: string,
  isStreamed: boolean = false,
  timeToFirstToken: number = 0,
  config?: ReveniumConfig
): Promise<void> {
  // Validate prerequisites and get configuration
  const meteringConfig = validateMeteringPrerequisites(config);
  if (!meteringConfig) {
    return; // Early exit if prerequisites not met
  }

  logger.debug('Metering call to Revenium for completion %s', responseId);

  // Determine provider from system fingerprint
  const provider = determineProvider(systemFingerprint);

  // Build completion request payload
  const completionRequest = buildCompletionRequest(
    responseId,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    stopReason,
    requestTime,
    responseTime,
    requestDuration,
    usageMetadata,
    provider,
    isStreamed,
    timeToFirstToken
  );

  // Log the arguments at debug level (matching Python)
  logger.debug(
    'Calling /meter/v2/ai/completions with args: %O',
    completionRequest
  );

  // Execute the metering request
  await executeMeteringRequest(
    completionRequest,
    meteringConfig.apiKey,
    meteringConfig.baseUrl
  );
}

/**
 * Generate secure request headers for API calls
 */
function getSecureHeaders(apiKey: string): Record<string, string> {
  const correlationId = generateCorrelationId();

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'n8n-revenium-middleware/1.0.0',
    'x-api-key': apiKey, // Revenium expects lowercase
    'X-Correlation-ID': correlationId,
    'X-Request-ID': correlationId,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };
}

/**
 * Validate response headers for security
 */
function validateResponseHeaders(response: Response): void {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    logger.warning('Unexpected content type in response: %s', contentType);
  }

  // Check for security headers in response
  const securityHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'strict-transport-security',
  ];

  securityHeaders.forEach(header => {
    if (!response.headers.get(header)) {
      logger.debug('Missing security header in response: %s', header);
    }
  });
}

/**
 * Type guard to check if an object has a schema property
 * @param obj - Object to check
 * @returns true if object has a schema property of the correct type
 */
export function hasValidSchema(
  obj: unknown
): obj is { schema: Record<string, unknown> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'schema' in obj &&
    typeof (obj as any).schema === 'object' &&
    (obj as any).schema !== null
  );
}

/**
 * Type guard to check if an object has a description property
 * @param obj - Object to check
 * @returns true if object has a description property of the correct type
 */
export function hasValidDescription(
  obj: unknown
): obj is { description: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'description' in obj &&
    typeof (obj as any).description === 'string'
  );
}

/**
 * Type guard to check if an object has tool schema properties
 * @param obj - Object to check
 * @returns true if object has properties and required arrays
 */
export function hasToolSchemaStructure(obj: unknown): obj is {
  properties?: Record<string, { type: string; description: string }>;
  required?: string[];
} {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const typedObj = obj as any;

  // Check properties if it exists
  if (
    ('properties' in typedObj && typeof typedObj.properties !== 'object') ||
    typedObj.properties === null
  )
    return false;

  // Check required if it exists
  if ('required' in typedObj && !Array.isArray(typedObj.required)) return false;

  return true;
}

/**
 * Type guard to check if an object has an id property
 * @param obj - Object to check
 * @returns true if object has an id property of string type
 */
export function hasValidId(obj: unknown): obj is { id: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: string }).id === 'string'
  );
}

/**
 * Type guard to check if an object has a message property
 * @param obj - Object to check
 * @returns true if object has a message property of string type
 */
export function hasValidMessage(obj: unknown): obj is { message: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    typeof (obj as { message: string }).message === 'string'
  );
}

/**
 * Type guard to check if an object is an n8n memory connection with response
 * @param obj - Object to check
 * @returns true if object has a response property
 */
export function isN8nMemoryConnection(
  obj: unknown
): obj is { response: unknown } {
  return typeof obj === 'object' && obj !== null && 'response' in obj;
}

/**
 * Type guard to check if an object has loadMemoryVariables method
 * @param obj - Object to check
 * @returns true if object has loadMemoryVariables function
 */
export function hasLoadMemoryVariables(obj: unknown): obj is {
  loadMemoryVariables: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'loadMemoryVariables' in obj &&
    typeof (
      obj as {
        loadMemoryVariables: (
          input: Record<string, unknown>
        ) => Promise<Record<string, unknown>>;
      }
    ).loadMemoryVariables === 'function'
  );
}

/**
 * Type guard to check if an object has getMessages method
 * @param obj - Object to check
 * @returns true if object has getMessages function
 */
export function hasGetMessages(
  obj: unknown
): obj is { getMessages: () => Promise<unknown[]> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'getMessages' in obj &&
    typeof (obj as { getMessages: () => Promise<unknown[]> }).getMessages ===
      'function'
  );
}

/**
 * Type guard to check if an object has saveContext method
 * @param obj - Object to check
 * @returns true if object has saveContext function
 */
export function hasSaveContext(obj: unknown): obj is {
  saveContext: (
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ) => Promise<void>;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'saveContext' in obj &&
    typeof (
      obj as {
        saveContext: (
          input: Record<string, unknown>,
          output: Record<string, unknown>
        ) => Promise<void>;
      }
    ).saveContext === 'function'
  );
}

/**
 * Type guard to check if an object has usage_metadata property
 * @param obj - Object to check
 * @returns true if object has usage_metadata
 */
export function hasUsageMetadata(obj: unknown): obj is {
  usage_metadata: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'usage_metadata' in obj &&
    typeof (
      obj as {
        usage_metadata: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        };
      }
    ).usage_metadata === 'object'
  );
}

/**
 * Type guard to check if an object has role and content properties for history messages
 * @param obj - Object to check
 * @returns true if object has role and content properties
 */
export function isHistoryMessage(
  obj: unknown
): obj is { role: string; content: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'role' in obj &&
    'content' in obj &&
    typeof (obj as { role: string }).role === 'string' &&
    typeof (obj as { content: string }).content === 'string'
  );
}

/**
 * Type guard to check if an object has a created property (for model sorting)
 * @param obj - Object to check
 * @returns true if object has created property of number type
 */
export function hasCreatedProperty(obj: unknown): obj is { created: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'created' in obj &&
    typeof (obj as { created: number }).created === 'number'
  );
}

/**
 * Type guard to check if an object is a LangChain message
 * @param obj - Object to check
 * @returns true if object has LangChain message structure
 */
export function isLangChainMessage(
  obj: unknown
): obj is { _getType: () => string; content: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '_getType' in obj &&
    'content' in obj &&
    typeof (obj as { content: string }).content === 'string'
  );
}

/**
 * Type guard to check if an object has token usage properties
 * @param obj - Object to check
 * @returns true if object has token usage properties
 */
export function hasTokenUsage(obj: unknown): obj is {
  prompt_tokens?: number;
  promptTokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  completionTokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  totalTokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
  output_token_details?: {
    reasoning?: number;
    audio?: number;
  };
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  input_token_details?: {
    cache_read?: number;
    audio?: number;
  };
} {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Make HTTP POST request to Revenium API /meter/v2/ai/completions endpoint
 */
export async function createCompletion(
  request: CreateCompletionRequest,
  config: ReveniumConfig
): Promise<CreateCompletionResponse> {
  const url = `${config.baseUrl}/v2/ai/completions`;
  logger.debug('Making POST request to: %s', url);

  const requestBody = JSON.stringify(request);
  const requestSizeKB = Buffer.byteLength(requestBody, 'utf8') / 1024;

  if (requestSizeKB > 100) {
    logger.warning('Large request payload: %d KB', requestSizeKB);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getSecureHeaders(config.apiKey),
    body: requestBody,
    // Add timeout and other security options
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  // Validate response headers
  validateResponseHeaders(response);

  // Log response status for debugging
  logger.debug(
    'Revenium API response status: %d %s',
    response.status,
    response.statusText
  );

  if (!response.ok) {
    const errorText = await response.text();
    const sanitizedError =
      errorText.length > 500 ? `${errorText.substring(0, 500)}...` : errorText;

    logger.error('Revenium API error %d: %s', response.status, sanitizedError);
    throw new Error(`Revenium API error ${response.status}: ${sanitizedError}`);
  }

  // Validate response size
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1024 * 1024) {
    // 1MB limit
    logger.warning('Large response payload: %s bytes', contentLength);
  }

  const result = (await response.json()) as CreateCompletionResponse;

  // Basic response validation
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid response format from Revenium API');
  }
  return result;
}

/**
 * Generate ISO timestamp string
 */
export function getISOTimestamp(date?: Date): string {
  return (date || new Date()).toISOString();
}

/**
 * Test mode flag to disable batching
 */
let isTestMode = false;

/**
 * Enable test mode (disables batching)
 */
export function enableTestMode(): void {
  isTestMode = true;
}

/**
 * Disable test mode (enables batching)
 */
export function disableTestMode(): void {
  isTestMode = false;
}

/**
 * Reset global state for testing
 * This function is exported for test utilities only
 */
export function resetGlobalStateForTesting(): void {
  // Enable test mode
  isTestMode = true;

  // Clear batch queue
  batchQueue = [];

  // Clear batch timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Reset processing flag
  isProcessingBatch = false;

  // Reset circuit breaker state
  reveniumCircuitBreaker.failures = 0;
  reveniumCircuitBreaker.lastFailureTime = 0;
  reveniumCircuitBreaker.state = 'CLOSED';

  // Reset rate limit state
  rateLimitState.requestsThisMinute = 0;
  rateLimitState.requestsThisHour = 0;
  rateLimitState.minuteWindowStart = Date.now();
  rateLimitState.hourWindowStart = Date.now();
}

/**
 * Force process all pending batches for testing
 * This function is exported for test utilities only
 */
export async function flushBatchesForTesting(): Promise<void> {
  // Process any pending batches
  if (batchQueue.length > 0) {
    await processBatch();
  }

  // Wait for any pending async operations
  await new Promise(resolve => setImmediate(resolve));
}

/**
 * Calculate duration between two dates in milliseconds
 */
export function calculateDuration(startTime: Date, endTime: Date): number {
  return endTime.getTime() - startTime.getTime();
}

/**
 * Validates that credentials object has required properties
 * @param credentials - The credentials object to validate
 * @returns Validated credentials object
 * @throws Error if validation fails
 */
export function validateCredentials(
  credentials: unknown
): ReveniumOpenAICredentials {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Invalid credentials: must be an object');
  }

  const creds = credentials as Record<string, unknown>;

  // Validate OpenAI API key with comprehensive validation
  if (!creds.openaiApiKey || typeof creds.openaiApiKey !== 'string') {
    throw new Error(
      'Invalid credentials: openaiApiKey is required and must be a string'
    );
  }
  validateApiKey(creds.openaiApiKey, 'OpenAI API key');

  // Validate Revenium API key with comprehensive validation
  if (!creds.reveniumApiKey || typeof creds.reveniumApiKey !== 'string') {
    throw new Error(
      'Invalid credentials: reveniumApiKey is required and must be a string'
    );
  }
  validateApiKey(creds.reveniumApiKey, 'Revenium API key');

  // Validate Revenium base URL (required)
  if (!creds.reveniumBaseUrl || typeof creds.reveniumBaseUrl !== 'string') {
    throw new Error(
      'Invalid credentials: reveniumBaseUrl is required and must be a string'
    );
  }
  validateSecureUrl(
    creds.reveniumBaseUrl,
    ALLOWED_REVENIUM_BASE_URLS,
    'Revenium base URL'
  );

  // Validate OpenAI base URL (optional)
  if (creds.openaiBaseUrl) {
    if (typeof creds.openaiBaseUrl !== 'string') {
      throw new Error(
        'Invalid credentials: openaiBaseUrl must be a string if provided'
      );
    }
    validateSecureUrl(
      creds.openaiBaseUrl,
      ALLOWED_OPENAI_BASE_URLS,
      'OpenAI base URL'
    );
  }

  return creds as unknown as ReveniumOpenAICredentials;
}

/**
 * Creates a standardized error with proper context
 * @param message - Error message
 * @param cause - Original error that caused this
 * @param code - Error code for categorization
 * @param statusCode - HTTP status code if applicable
 * @returns ReveniumError instance
 */
export function createReveniumError(
  message: string,
  cause?: unknown,
  code?: string,
  statusCode?: number
): ReveniumError {
  const error = new Error(message) as ReveniumError;
  error.name = 'ReveniumError';
  if (code) error.code = code;
  if (statusCode) error.statusCode = statusCode;

  if (cause) error.cause = cause;
  if (cause instanceof Error)
    error.stack = `${error.stack}\nCaused by: ${cause.stack}`;

  return error;
}

/**
 * Safely extracts error message from unknown error type
 * @param error - Unknown error object
 * @returns Safe error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (hasValidMessage(error)) {
    return error.message;
  }
  return 'Unknown error occurred';
}

/**
 * Safely extracts error details for logging
 * @param error - Unknown error object
 * @returns Error details object
 */
export function getErrorDetails(error: unknown): {
  message: string;
  name?: string;
  code?: string;
  statusCode?: number;
  stack?: string;
} {
  const details = {
    message: getErrorMessage(error),
  };

  if (error instanceof Error) {
    const reveniumError = error as ReveniumError;
    return {
      ...details,
      name: error.name,
      ...(reveniumError.code !== undefined ? { code: reveniumError.code } : {}),
      ...(reveniumError.statusCode !== undefined
        ? { statusCode: reveniumError.statusCode }
        : {}),
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }

  return details;
}

/**
 * Sanitize sensitive data from logs and error messages
 * @param data - Data to sanitize
 * @returns Sanitized data with sensitive information masked
 */
export function sanitizeForLogging(data: unknown): unknown {
  if (typeof data === 'string') {
    // Mask API keys
    return data
      .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***MASKED***')
      .replace(/[a-zA-Z0-9]{32,}/g, match => {
        if (match.length > 20) {
          return `${match.substring(0, 4)}***MASKED***${match.substring(match.length - 4)}`;
        }
        return match;
      });
  }

  if (data && typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Mask sensitive fields
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('credential')
      ) {
        sanitized[key] = '***MASKED***';
      } else if (typeof value === 'string' && value.length > 20) {
        // Mask long strings that might be sensitive
        sanitized[key] = sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Check if request is within rate limits
 * @param config - Rate limit configuration
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): boolean {
  const now = Date.now();

  // Reset minute window if needed
  if (now - rateLimitState.minuteWindowStart > 60000) {
    rateLimitState.requestsThisMinute = 0;
    rateLimitState.minuteWindowStart = now;
  }

  // Reset hour window if needed
  if (now - rateLimitState.hourWindowStart > 3600000) {
    rateLimitState.requestsThisHour = 0;
    rateLimitState.hourWindowStart = now;
  }

  // Check limits
  if (rateLimitState.requestsThisMinute >= config.maxRequestsPerMinute) {
    logger.warning(
      'Rate limit exceeded: %d requests per minute',
      rateLimitState.requestsThisMinute
    );
    return false;
  }

  if (rateLimitState.requestsThisHour >= config.maxRequestsPerHour) {
    logger.warning(
      'Rate limit exceeded: %d requests per hour',
      rateLimitState.requestsThisHour
    );
    return false;
  }

  // Increment counters
  rateLimitState.requestsThisMinute++;
  rateLimitState.requestsThisHour++;

  return true;
}
