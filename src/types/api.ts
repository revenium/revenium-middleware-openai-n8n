/**
 * API-related type definitions for Revenium middleware
 */

// Usage metadata that can be passed to OpenAI calls
export interface UsageMetadata {
  // Legacy snake_case support (for backwards compatibility)
  trace_id?: string;
  task_id?: string;
  task_type?: string;
  subscriber_email?: string;
  subscriber_credential_name?: string;
  subscriber_credential?: string;
  subscriber_id?: string;
  organization_id?: string;
  subscription_id?: string;
  product_id?: string;
  agent?: string;
  response_quality_score?: number; // 0..1

  // New camelCase support (preferred for UI consistency)
  traceId?: string;
  taskId?: string;
  taskType?: string;
  subscriberEmail?: string;
  subscriberCredentialName?: string;
  subscriberCredential?: string;
  subscriberId?: string;
  organizationId?: string;
  subscriptionId?: string;
  productId?: string;
  responseQualityScore?: number; // 0..10

  // Prompt capture configuration
  capturePrompts?: boolean;
  maxPromptSize?: number;
}

// New subscriber-related interfaces for nested structure
export interface SubscriberCredential {
  name: string;
  value: string;
}

export interface SubscriberInfo {
  id?: string;
  email?: string;
  credential?: SubscriberCredential;
}

// Helper type for building subscriber object from flat metadata
export type SubscriberMetadata = Pick<
  UsageMetadata,
  | 'subscriberEmail'
  | 'subscriber_email'
  | 'subscriberId'
  | 'subscriber_id'
  | 'subscriberCredentialName'
  | 'subscriber_credential_name'
  | 'subscriberCredential'
  | 'subscriber_credential'
>;

// Revenium API request payload for /meter/v2/ai/completions
export interface CreateCompletionRequest {
  stopReason: ReveniumStopReason;
  costType: 'AI';
  isStreamed: boolean;
  taskType?: string;
  agent?: string;
  operationType: 'CHAT';
  inputTokenCount: number;
  outputTokenCount: number;
  reasoningTokenCount: number;
  cacheCreationTokenCount: number;
  cacheReadTokenCount: number;
  totalTokenCount: number;
  organizationId?: string;
  productId?: string;
  subscriber?: SubscriberInfo;
  middlewareSource: string;
  subscriptionId?: string;
  model: string;
  transactionId: string;
  responseTime: string; // ISO string
  requestDuration: number; // milliseconds
  provider: 'OPENAI' | 'OLLAMA';
  requestTime: string; // ISO string
  completionStartTime: string; // ISO string
  timeToFirstToken: number; // milliseconds
  traceId?: string;
  responseQualityScore?: number;
  attributes?: Record<string, unknown>;
  systemPrompt?: string;
  inputMessages?: string;
  outputResponse?: string;
  promptsTruncated?: boolean;
}

// Revenium API response
export interface CreateCompletionResponse {
  id: string;
  [key: string]: unknown; // Allow additional fields
}

// Configuration for Revenium API client
export interface ReveniumConfig {
  apiKey: string;
  baseUrl: string;
}

// Combined credentials for n8n
export interface ReveniumOpenAICredentials {
  openaiApiKey: string;
  openaiBaseUrl?: string;
  reveniumApiKey: string;
  reveniumBaseUrl: string;
  usageMetadata?: UsageMetadata;
  printSummary?: boolean | 'human' | 'json';
  teamId?: string;
}

// Revenium stop reasons (matches API schema)
export type ReveniumStopReason =
  | 'END' // Completion ended normally
  | 'END_SEQUENCE' // Ended due to reaching end sequence
  | 'TIMEOUT' // Ended due to timeout
  | 'TOKEN_LIMIT' // Ended due to reaching token limit
  | 'COST_LIMIT' // Ended due to reaching cost limit
  | 'COMPLETION_LIMIT' // Ended due to reaching completion limit
  | 'ERROR' // Ended due to error
  | 'CANCELLED'; // Completion was cancelled

// Error types for better error handling
export interface ReveniumError extends Error {
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}
