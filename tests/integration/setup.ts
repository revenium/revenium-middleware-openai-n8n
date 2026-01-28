/**
 * Integration test setup and utilities
 * Provides common setup for integration tests including mocks and test data
 */

import { vi } from 'vitest';
import type {
  IExecuteFunctions,
  INodeExecutionData,
  ISupplyDataFunctions,
} from 'n8n-workflow';
import type { ChatResult } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import { buildReveniumUrl } from '../../src/utils/url-builder.js';

/**
 * Mock Revenium API responses
 */
export const mockReveniumAPI = {
  success: {
    status: 200,
    ok: true,
    text: () =>
      Promise.resolve('{"success": true, "transactionId": "test-123"}'),
    json: () => Promise.resolve({ success: true, transactionId: 'test-123' }),
  },
  error: {
    status: 400,
    ok: false,
    text: () => Promise.resolve('{"error": "Invalid request"}'),
    json: () => Promise.resolve({ error: 'Invalid request' }),
  },
  timeout: {
    status: 408,
    ok: false,
    text: () => Promise.resolve('{"error": "Request timeout"}'),
    json: () => Promise.resolve({ error: 'Request timeout' }),
  },
};

/**
 * Mock OpenAI API responses
 */
export const mockOpenAIResponse = {
  generations: [
    {
      text: 'This is a test response from OpenAI',
      message: {
        content: 'This is a test response from OpenAI',
        response_metadata: {
          model_name: 'gpt-4',
          finish_reason: 'stop',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
          system_fingerprint: 'fp_test123',
        },
        usage_metadata: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
        id: 'chatcmpl-test123',
      },
    },
  ],
};

/**
 * Mock streaming OpenAI response
 */
export const mockStreamingResponse = [
  {
    text: 'This',
    generationInfo: {
      response_metadata: {
        model_name: 'gpt-4',
        finish_reason: null,
      },
    },
  },
  {
    text: ' is',
    generationInfo: {
      response_metadata: {
        model_name: 'gpt-4',
        finish_reason: null,
      },
    },
  },
  {
    text: ' a test',
    generationInfo: {
      response_metadata: {
        model_name: 'gpt-4',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      },
      usage_metadata: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    },
  },
];

/**
 * Create mock execution functions for n8n nodes
 */
export function createMockExecuteFunctions(
  inputData: INodeExecutionData[] = []
): IExecuteFunctions {
  const mockExecuteFunctions = {
    getInputData: vi.fn(() => inputData),
    getNodeParameter: vi.fn(),
    getInputConnectionData: vi.fn(),
    getNode: vi.fn(() => ({
      id: 'test-node-id',
      name: 'Test Node',
      type: 'test-type',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    })),
    continueOnFail: vi.fn(() => false),
    getExecutionId: vi.fn(() => 'test-execution-id'),
    getWorkflow: vi.fn(() => ({
      id: 'test-workflow-id',
      name: 'Test Workflow',
    })),
    getMode: vi.fn(() => 'manual'),
    getTimezone: vi.fn(() => 'UTC'),
    getCredentials: vi.fn(),
    helpers: {
      request: vi.fn(),
      requestWithAuthentication: vi.fn(),
      requestOAuth2: vi.fn(),
      requestOAuth1: vi.fn(),
      httpRequest: vi.fn(),
      prepareBinaryData: vi.fn(),
      getBinaryDataBuffer: vi.fn(),
    },
  } as unknown as IExecuteFunctions;

  return mockExecuteFunctions;
}

/**
 * Create mock supply data functions for n8n Chat Model nodes
 */
export function createMockSupplyDataFunctions(): ISupplyDataFunctions {
  const mockSupplyDataFunctions = {
    getCredentials: vi.fn(),
    getNodeParameter: vi.fn(),
    getNode: vi.fn(() => ({
      id: 'test-node-id',
      name: 'Test Chat Model Node',
      type: 'reveniumOpenAIChatModel',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    })),
    helpers: {
      request: vi.fn(),
    },
  } as unknown as ISupplyDataFunctions;

  return mockSupplyDataFunctions;
}

/**
 * Create a mock Revenium tracked ChatOpenAI instance
 */
export function createMockReveniumChatModel() {
  return {
    _generate: vi.fn(),
    _streamResponseChunks: vi.fn(),
    invoke: vi.fn(),
    stream: vi.fn(),
    batch: vi.fn(),
    _llmType: 'openai-chat',
    reveniumCredentials: mockReveniumCredentials,
  };
}

/**
 * Create test input data for n8n nodes
 */
export function createTestInputData(
  data: Record<string, unknown>[] = []
): INodeExecutionData[] {
  if (data.length === 0) {
    data = [{ message: 'Hello, this is a test message' }];
  }

  return data.map(item => ({
    json: item as any,
    pairedItem: { item: 0 },
  }));
}

/**
 * Mock Revenium credentials
 */
export const mockReveniumCredentials = {
  openaiApiKey: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef12',
  reveniumApiKey: 'rev-1234567890abcdef1234567890abcdef1234567890abcdef12',
  reveniumBaseUrl: 'https://api.revenium.ai',
  usageMetadata: {
    organizationName: 'test-org-123',
    subscriptionId: 'test-sub-456',
    productName: 'test-product-789',
    subscriberId: 'test-subscriber-abc',
    subscriberEmail: 'test@example.com',
    traceId: 'test-trace-xyz',
    taskType: 'chat_completion',
    agent: 'n8n-integration-test',
  },
};

/**
 * Mock memory connection for AI Agent tests
 */
export const mockMemoryConnection = {
  loadMemoryVariables: vi.fn(() =>
    Promise.resolve({
      history: ['Human: Previous question', 'AI: Previous response'],
    })
  ),
  saveContext: vi.fn(() => Promise.resolve()),
};

/**
 * Mock tool connections for AI Agent tests
 */
export const mockToolConnections = [
  {
    name: 'calculator',
    description: 'A calculator tool for mathematical operations',
    call: vi.fn(() => Promise.resolve('42')),
    schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate',
        },
      },
      required: ['expression'],
    },
  },
];

/**
 * Setup global fetch mock for API calls
 */
export function setupFetchMock() {
  global.fetch = vi.fn();
  return global.fetch;
}

/**
 * Reset all mocks between tests
 */
export function resetMocks() {
  vi.clearAllMocks();
  if (global.fetch) {
    (global.fetch as any).mockReset();
  }
}

/**
 * Create environment variables for testing
 */
export function setupTestEnvironment() {
  process.env.REVENIUM_LOG_LEVEL = 'DEBUG';
  process.env.NODE_ENV = 'test';
  process.env.REVENIUM_MODEL_TIMEOUT = '30000';
  process.env.REVENIUM_TOOL_TIMEOUT = '10000';
  process.env.REVENIUM_STREAM_TIMEOUT = '20000';
  process.env.REVENIUM_API_TIMEOUT = '5000';
}

/**
 * Cleanup test environment
 */
export function cleanupTestEnvironment() {
  delete process.env.REVENIUM_LOG_LEVEL;
  delete process.env.REVENIUM_MODEL_TIMEOUT;
  delete process.env.REVENIUM_TOOL_TIMEOUT;
  delete process.env.REVENIUM_STREAM_TIMEOUT;
  delete process.env.REVENIUM_API_TIMEOUT;
}

/**
 * Simple API function for testing Revenium API calls
 */
export async function sendToReveniumAPI(
  baseUrl: string,
  apiKey: string,
  payload: any
): Promise<any> {
  const url = buildReveniumUrl(baseUrl, '/ai/completions');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': apiKey,
      'User-Agent': 'n8n-revenium-middleware/1.0.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Revenium API error (${response.status}): ${errorText}`);
  }

  return response;
}
