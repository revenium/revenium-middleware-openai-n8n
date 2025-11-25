/**
 * OpenAI-related type definitions
 */

// OpenAI finish reasons mapped to Revenium stop reasons
export type OpenAIFinishReason = 'stop' | 'function_call' | 'tool_calls' | 'timeout' | 'length' | 'content_filter' | null;

// Token usage information from OpenAI response
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
}

// OpenAI configuration
export interface OpenAIConfig {
  apiKey: string;
}

// OpenAI API response types for better type safety
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
}

export interface OpenAIChoice {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: OpenAIFinishReason;
  index: number;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
  // Note: v5 removes 'data' property for direct responses
  // List methods now return arrays directly or use iterators
}

// v5 compatible types for models.list() response
export interface OpenAIModelsListResponse extends Array<{
  id: string;
  object: string;
  created: number;
  owned_by: string;
}> {}

// LangChain message types for better integration
export interface LangChainMessage {
  content: string;
  role?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  response_metadata?: {
    usage?: OpenAIUsage;
    [key: string]: unknown;
  };
}

// LangChain message structure for streaming
export interface LangChainMessageForTracking {
  content: string;
  response_metadata?: Record<string, unknown>;
  usage_metadata?: Record<string, unknown>;
}

// Tool schema types for n8n integration
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
      }>;
      required: string[];
    };
  };
}
