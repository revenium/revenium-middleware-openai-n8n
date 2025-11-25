/**
 * Validation utilities for Revenium middleware
 */

/**
 * Validates API key format and content
 * @param apiKey - API key to validate
 * @param keyType - Type of key for error messages (e.g., 'OpenAI API key')
 * @returns true if valid, throws error if invalid
 */
export function validateApiKey(apiKey: unknown, keyType: string = 'API key'): boolean {
  if (typeof apiKey !== 'string') {
    throw new Error(`Invalid ${keyType}: must be a string`);
  }

  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    throw new Error(`Invalid ${keyType}: cannot be empty`);
  }

  // Basic length validation (most API keys are at least 20 characters)
  if (trimmedKey.length < 20) {
    throw new Error(`Invalid ${keyType}: API key appears too short (minimum 20 characters)`);
  }

  // Check for common placeholder values
  const placeholders = ['your-api-key', 'api-key-here', 'replace-me', 'test', 'demo', 'example'];
  if (placeholders.some(placeholder => trimmedKey.toLowerCase().includes(placeholder))) {
    throw new Error(`Invalid ${keyType}: API key appears to be a placeholder value`);
  }

  // OpenAI specific validation
  if (keyType.toLowerCase().includes('openai') && trimmedKey.startsWith('sk-')) {
    throw new Error(`Invalid ${keyType}: OpenAI API keys must start with 'sk-'`);
  }

  return true;
}

/**
 * Validates URL format and security
 * @param url - URL to validate
 * @param allowHttp - Whether to allow HTTP URLs (default: false, HTTPS only)
 * @returns true if valid, throws error if invalid
 */
export function validateSecureUrl(url: unknown, allowHttp: boolean = false): boolean {
  if (typeof url !== 'string') {
    throw new Error('Invalid URL: must be a string');
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    throw new Error('Invalid URL: cannot be empty');
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    
    if (!allowHttp && parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid URL: must use HTTPS protocol for security');
    }
    
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL: must use HTTP or HTTPS protocol');
    }
    
    return true;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validates model name format
 * @param modelName - Model name to validate
 * @returns true if valid, throws error if invalid
 */
export function validateModelName(modelName: unknown): boolean {
  if (typeof modelName !== 'string') {
    throw new Error('Invalid model name: must be a string');
  }

  const trimmed = modelName.trim();
  if (trimmed.length === 0) {
    throw new Error('Invalid model name: cannot be empty');
  }

  // Basic format validation - model names should be reasonable length
  if (trimmed.length > 100) {
    throw new Error('Invalid model name: too long (maximum 100 characters)');
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
export function validateTimeout(timeout: unknown, allowUndefined: boolean = true): boolean {
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
 * Type guard to check if an object has a schema property
 * @param obj - Object to check
 * @returns true if object has a schema property of the correct type
 */
export function hasValidSchema(obj: unknown): obj is { schema: Record<string, unknown> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'schema' in obj &&
    typeof (obj as { schema: Record<string, unknown> }).schema === 'object' &&
    (obj as { schema: Record<string, unknown> }).schema !== null
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
  if (typeof obj !== 'object' || obj === null) return false;

  const typedObj = obj as { properties?: Record<string, { type: string; description: string }>; required?: string[] };

  // Check properties if it exists
  if("properties" in typedObj && typeof typedObj.properties !== 'object' || typedObj.properties === null) return false;
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
 * Type guard to check if an object is an n8n memory connection
 * @param obj - Object to check
 * @returns true if object has n8n memory connection structure
 */
export function isN8nMemoryConnection(obj: unknown): obj is { response?: unknown } {
  return (
    typeof obj === 'object' &&
    obj !== null
  );
}

/**
 * Type guard to check if an object has loadMemoryVariables method
 * @param obj - Object to check
 * @returns true if object has loadMemoryVariables function
 */
export function hasLoadMemoryVariables(obj: unknown): obj is { loadMemoryVariables: (input: Record<string, unknown>) => Promise<Record<string, unknown>> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'loadMemoryVariables' in obj &&
    typeof (obj as { loadMemoryVariables: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }).loadMemoryVariables === 'function'
  );
}

/**
 * Type guard to check if an object has getMessages method
 * @param obj - Object to check
 * @returns true if object has getMessages function
 */
export function hasGetMessages(obj: unknown): obj is { getMessages: () => Promise<unknown[]> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'getMessages' in obj &&
    typeof (obj as { getMessages: () => Promise<unknown[]> }).getMessages === 'function'
  );
}

/**
 * Type guard to check if an object has saveContext method
 * @param obj - Object to check
 * @returns true if object has saveContext function
 */
export function hasSaveContext(obj: unknown): obj is { saveContext: (input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'saveContext' in obj &&
    typeof (obj as { saveContext: (input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void> }).saveContext === 'function'
  );
}

/**
 * Type guard to check if an object is a history message
 * @param obj - Object to check
 * @returns true if object has history message structure
 */
export function isHistoryMessage(obj: unknown): obj is { role: string; content: string } {
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
 * Type guard to check if an object is a LangChain message
 * @param obj - Object to check
 * @returns true if object has LangChain message structure
 */
export function isLangChainMessage(obj: unknown): obj is { _getType: () => string; content: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '_getType' in obj &&
    'content' in obj &&
    typeof (obj as any).content === 'string'
  );
}

/**
 * Type guard to check if an object has usage metadata
 * @param obj - Object to check
 * @returns true if object has usage_metadata property
 */
export function hasUsageMetadata(obj: unknown): obj is { usage_metadata: Record<string, unknown> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'usage_metadata' in obj &&
    typeof (obj as { usage_metadata: Record<string, unknown> }).usage_metadata === 'object'
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
  return (
    typeof obj === 'object' &&
    obj !== null
  );
}
