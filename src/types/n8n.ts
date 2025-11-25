/**
 * n8n-specific type definitions
 */

// Enhanced n8n node types for better type safety
export interface N8nNodeOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface N8nMemoryOptions {
  saveToMemory?: boolean;
  includePrevious?: boolean;
  maxMessages?: number;
}

export interface N8nToolOptions {
  toolChoice?: 'auto' | 'none' | 'required';
  maxIterations?: number;
  saveToolCalls?: boolean;
}

// n8n Integration Types for type-safe interactions
export interface N8nMemoryConnection {
  response?: unknown;
}

export interface N8nMemoryWithLoadVariables {
  loadMemoryVariables(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface N8nMemoryWithGetMessages {
  getMessages(): Promise<unknown[]>;
}

export interface N8nMemoryWithSaveContext {
  saveContext(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void>;
}

export interface N8nHistoryMessage {
  role?: string;
  content?: string;
}

export interface N8nUsageMetadata {
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface N8nModelWithCreated {
  created?: number;
}
