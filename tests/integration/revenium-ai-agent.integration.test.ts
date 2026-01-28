/**
 * Integration tests for ReveniumAIAgent node
 * Tests end-to-end n8n node execution with memory, tools, and Revenium tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { ReveniumAIAgent } from '../../nodes/ReveniumAIAgent/ReveniumAIAgent.node.js';
import {
  createMockExecuteFunctions,
  createTestInputData,
  setupFetchMock,
  resetMocks,
  setupTestEnvironment,
  cleanupTestEnvironment,
  mockReveniumAPI,
  mockReveniumCredentials,
  mockMemoryConnection,
  mockToolConnections
} from './setup.js';

describe('ReveniumAIAgent Integration Tests', () => {
  let aiAgent: ReveniumAIAgent;
  let mockExecuteFunctions: IExecuteFunctions;
  let fetchMock: any;

  beforeEach(() => {
    setupTestEnvironment();
    fetchMock = setupFetchMock();
    aiAgent = new ReveniumAIAgent();

    // Create mock execution functions
    mockExecuteFunctions = createMockExecuteFunctions(createTestInputData([
      { message: 'Hello, can you help me calculate 2 + 2?' }
    ]));

    // Setup node parameters
    (mockExecuteFunctions.getNodeParameter as any)
      .mockImplementation((paramName: string) => {
        switch (paramName) {
          case 'model':
            return 'gpt-4';
          case 'systemMessage':
            return 'You are a helpful AI assistant.';
          case 'requireFormat':
            return false;
          case 'promptSource':
            return 'manual';
          case 'prompt':
            return 'Please calculate 2 + 2';
          case 'temperature':
            return 0.7;
          case 'maxTokens':
            return 1000;
          case 'streaming':
            return false;
          case 'memoryOptions':
            return {
              includePrevious: true,
              maxMessages: 10
            };
          case 'toolOptions':
            return {
              toolChoice: 'auto'
            };
          case 'reveniumCredentials':
            return mockReveniumCredentials;
          default:
            return undefined;
        }
      });

    // Note: Connection data mocking is now handled in the beforeEach block with persistent mocks
  });

  afterEach(() => {
    resetMocks();
    cleanupTestEnvironment();
    // Force garbage collection to prevent memory leaks
    if (global.gc) {
      global.gc();
    }
  });

  // Create persistent mock objects that can be tracked across tests
  let persistentMockChatModel: any;
  let persistentMockToolConnections: any[];
  let persistentMockMemoryConnection: any;

  beforeEach(() => {
    // Create realistic mock ChatModel that validates actual invocation patterns
    persistentMockChatModel = {
      invoke: vi.fn().mockImplementation((messages, options) => {
        // Validate that messages array is properly structured
        if (!Array.isArray(messages) || messages.length === 0) {
          throw new Error('Invalid messages array provided to ChatModel');
        }

        // Validate message structure
        for (const message of messages) {
          if (!message.content || typeof message.content !== 'string') {
            throw new Error('Invalid message structure: missing or invalid content');
          }
        }

        // Validate options when tools are provided
        if (options && options.tools) {
          if (!Array.isArray(options.tools)) {
            throw new Error('Tools must be an array');
          }
          if (!options.tool_choice) {
            throw new Error('tool_choice must be specified when tools are provided');
          }
        }

        // Return realistic response based on actual invocation patterns
        const hasTools = options && options.tools && options.tools.length > 0;
        const lastMessage = messages[messages.length - 1];

        // For tool tests, return tool calls only if tools are actually provided
        if (hasTools && lastMessage.content.includes('calculator')) {
          return Promise.resolve({
            content: '',
            tool_calls: [{
              id: 'call_123',
              name: 'calculator',
              args: { expression: '2 + 2' }
            }],
            response_metadata: {
              model_name: 'gpt-4',
              finish_reason: 'tool_calls',
              usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 }
            }
          });
        }

        // Default response that validates the full execution path
        return Promise.resolve({
          content: `I received ${messages.length} messages. The latest message was: "${lastMessage.content.substring(0, 50)}..."`,
          response_metadata: {
            model_name: 'gpt-4',
            finish_reason: 'stop',
            usage: { prompt_tokens: 15, completion_tokens: 12, total_tokens: 27 }
          }
        });
      }),
      bind: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockReturnThis(),
      _llmType: 'openai-chat',
      temperature: 0.7,
      maxTokens: 1000,
      modelName: 'gpt-4'
    };

    // Create realistic mock tool connections that validate actual tool execution
    persistentMockToolConnections = [{
      call: vi.fn().mockImplementation((input) => {
        // Validate that tool is called with proper arguments
        if (!input || typeof input !== 'object') {
          throw new Error('Tool must be called with an object containing arguments');
        }

        // Simulate actual tool execution logic
        if (input.expression) {
          // Simple calculator logic for testing
          try {
            const result = eval(input.expression); // Only for testing - never use eval in production
            return Promise.resolve({ result });
          } catch (error) {
            throw new Error(`Calculator error: ${error.message}`);
          }
        }

        throw new Error('Calculator tool requires an "expression" argument');
      }),
      name: 'calculator',
      description: 'A calculator tool for mathematical operations'
    }];

    // Create realistic mock memory connection that validates memory operations
    persistentMockMemoryConnection = {
      loadMemoryVariables: vi.fn().mockImplementation((inputs) => {
        // Validate that memory loading is called with proper inputs
        if (inputs && typeof inputs !== 'object') {
          throw new Error('Memory loadMemoryVariables must be called with an object or undefined');
        }

        // Return realistic conversation history
        return Promise.resolve({
          history: [
            'Human: What is 1 + 1?',
            'AI: 1 + 1 = 2'
          ]
        });
      }),
      saveContext: vi.fn().mockImplementation((inputs, outputs) => {
        // Validate that memory saving is called with proper parameters
        if (!inputs || !outputs) {
          throw new Error('Memory saveContext requires both inputs and outputs');
        }
        if (typeof inputs !== 'object' || typeof outputs !== 'object') {
          throw new Error('Memory saveContext inputs and outputs must be objects');
        }

        return Promise.resolve();
      }),
      invoke: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          history: [
            { role: 'user', content: 'What did we discuss before?' },
            { role: 'assistant', content: 'We discussed previous conversation topics.' }
          ]
        });
      })
    };

    // Update the existing mock to return persistent objects
    const originalGetInputConnectionData = mockExecuteFunctions.getInputConnectionData;
    (mockExecuteFunctions.getInputConnectionData as any)
      .mockImplementation((connectionType: string, index: number) => {
        if (connectionType === NodeConnectionTypes.AiLanguageModel) {
          return persistentMockChatModel;
        }
        if (connectionType === NodeConnectionTypes.AiTool) {
          return persistentMockToolConnections[index] || persistentMockToolConnections[0];
        }
        if (connectionType === NodeConnectionTypes.AiMemory) {
          return persistentMockMemoryConnection;
        }
        // For other connection types, return null
        return null;
      });
  });

  describe('Basic Agent Execution', () => {
    it('should execute agent with simple message', async () => {
      // Note: Revenium tracking is handled by the Revenium OpenAI Chat Model
      // The AI Agent itself doesn't make direct API calls to Revenium
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);

      // Verify execution result structure
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toHaveProperty('response');
      expect(result[0][0].json).toHaveProperty('revenium_tracking');

      // Verify the ChatModel was invoked with proper parameters
      expect(persistentMockChatModel.invoke).toHaveBeenCalledTimes(1);
      const [messages, options] = persistentMockChatModel.invoke.mock.calls[0];

      // Validate message structure
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toHaveProperty('content');

      // Verify system message is included
      expect(messages.some((msg: any) =>
        msg.content && msg.content.includes('helpful AI assistant')
      )).toBe(true);

      // Verify user message is included
      expect(messages.some((msg: any) =>
        msg.content && msg.content.includes('calculate 2 + 2')
      )).toBe(true);

      // Verify response reflects actual execution path
      expect(result[0][0].json.response).toContain('I received');
      expect(result[0][0].json.response).toContain('messages');
    });

    it('should handle memory integration', async () => {
      // Override the prompt for this specific test
      (mockExecuteFunctions.getNodeParameter as any)
        .mockImplementation((paramName: string) => {
          switch (paramName) {
            case 'model':
              return 'gpt-4';
            case 'systemMessage':
              return 'You are a helpful AI assistant.';
            case 'requireFormat':
              return false;
            case 'promptSource':
              return 'manual';
            case 'prompt':
              return 'What did we discuss before about math problems?';
            case 'temperature':
              return 0.7;
            case 'maxTokens':
              return 1000;
            case 'memoryOptions':
              return {
                includePrevious: true,
                maxMessages: 10,
                saveToMemory: true
              };
            case 'toolOptions':
              return {
                toolChoice: 'auto'
              };
            case 'reveniumCredentials':
              return mockReveniumCredentials;
            default:
              return undefined;
          }
        });

      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);

      // Verify memory operations were called with proper parameters
      expect(persistentMockMemoryConnection.loadMemoryVariables).toHaveBeenCalledTimes(1);

      // Verify memory saving was called with proper inputs and outputs
      expect(persistentMockMemoryConnection.saveContext).toHaveBeenCalledTimes(1);
      const saveCall = persistentMockMemoryConnection.saveContext.mock.calls[0];
      expect(saveCall[0]).toBeDefined(); // inputs
      expect(saveCall[1]).toBeDefined(); // outputs

      // Verify the ChatModel received conversation history
      expect(persistentMockChatModel.invoke).toHaveBeenCalledTimes(1);
      const [messages] = persistentMockChatModel.invoke.mock.calls[0];

      // Should include system message + history + user message
      expect(messages.length).toBeGreaterThan(2);

      // Verify conversation history was included in messages
      const messageContent = JSON.stringify(messages);
      expect(messageContent).toContain('1 + 1'); // From history

      // Verify result structure
      expect(result[0][0].json).toHaveProperty('conversation_saved', true);
      expect(result[0][0].json.response).toBeDefined();
    });

    it('should handle tool integration', async () => {
      // Override the prompt for this specific test to trigger tool calls
      (mockExecuteFunctions.getNodeParameter as any)
        .mockImplementation((paramName: string) => {
          switch (paramName) {
            case 'model':
              return 'gpt-4';
            case 'systemMessage':
              return 'You are a helpful AI assistant.';
            case 'requireFormat':
              return false;
            case 'promptSource':
              return 'manual';
            case 'prompt':
              return 'Use the calculator tool to compute 2 + 2';
            case 'temperature':
              return 0.7;
            case 'maxTokens':
              return 1000;
            case 'memoryOptions':
              return {
                includePrevious: true,
                maxMessages: 10
              };
            case 'toolOptions':
              return {
                toolChoice: 'auto',
                maxIterations: 5
              };
            case 'reveniumCredentials':
              return mockReveniumCredentials;
            default:
              return undefined;
          }
        });

      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);

      // Verify ChatModel was called with tools
      expect(persistentMockChatModel.invoke).toHaveBeenCalledTimes(1);
      const [messages, options] = persistentMockChatModel.invoke.mock.calls[0];

      // Verify tools were passed to the model
      expect(options).toBeDefined();
      expect(options.tools).toBeDefined();
      expect(Array.isArray(options.tools)).toBe(true);
      expect(options.tools.length).toBeGreaterThan(0);
      expect(options.tool_choice).toBe('auto');

      // Verify tool was actually called with correct arguments
      expect(persistentMockToolConnections[0].call).toHaveBeenCalledTimes(1);
      const toolCallArgs = persistentMockToolConnections[0].call.mock.calls[0][0];
      expect(toolCallArgs).toHaveProperty('expression', '2 + 2');

      // Verify result structure includes tool execution data
      expect(result[0][0].json).toHaveProperty('tools_executed', 1);
      expect(result[0][0].json).toHaveProperty('tool_calls');
      expect(Array.isArray(result[0][0].json.tool_calls)).toBe(true);
      expect(result[0][0].json.tool_calls.length).toBe(1);
    });
  });

  describe('Streaming Support', () => {
    it('should handle streaming responses', async () => {
      // Enable streaming
      (mockExecuteFunctions.getNodeParameter as any)
        .mockImplementation((paramName: string) => {
          switch (paramName) {
            case 'model':
              return 'gpt-4';
            case 'systemMessage':
              return 'You are a helpful AI assistant.';
            case 'requireFormat':
              return false;
            case 'promptSource':
              return 'manual';
            case 'prompt':
              return 'Hello, please respond with streaming';
            case 'temperature':
              return 0.7;
            case 'maxTokens':
              return 1000;
            case 'streaming':
              return true; // Enable streaming for this test
            case 'memoryOptions':
              return {
                includePrevious: true,
                maxMessages: 10
              };
            case 'toolOptions':
              return {
                toolChoice: 'auto'
              };
            case 'reveniumCredentials':
              return mockReveniumCredentials;
            default:
              return undefined;
          }
        });

      // Mock Revenium tracking
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);

      // Verify streaming result - the mock returns a realistic response
      expect(result).toBeDefined();
      expect(result[0][0].json.response).toContain('I received');
      expect(result[0][0].json.response).toContain('streaming');
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors gracefully', async () => {
      // Mock the ChatModel to throw an error
      persistentMockChatModel.invoke.mockRejectedValueOnce(new Error('OpenAI API Error'));

      // The AI Agent should handle the error gracefully and throw a NodeOperationError
      await expect(aiAgent.execute.call(mockExecuteFunctions))
        .rejects.toThrow('OpenAI API Error');
    });

    it('should handle memory loading errors gracefully', async () => {
      // Mock memory error
      persistentMockMemoryConnection.loadMemoryVariables.mockRejectedValue(
        new Error('Memory loading failed')
      );

      // Mock Revenium tracking
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      // Should continue execution despite memory error
      const result = await aiAgent.execute.call(mockExecuteFunctions);
      expect(result).toBeDefined();
      expect(result[0][0].json.response).toContain('I received'); // Realistic mock response
    });

    it('should handle tool execution errors gracefully', async () => {
      // Mock tool error
      persistentMockToolConnections[0].call.mockRejectedValue(new Error('Tool execution failed'));

      // Mock Revenium tracking
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);

      // Should handle tool error gracefully and still return a response
      expect(result).toBeDefined();
      expect(result[0][0].json.response).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required parameters', async () => {
      // Mock missing required parameter
      (mockExecuteFunctions.getNodeParameter as any)
        .mockImplementation((paramName: string) => {
          if (paramName === 'model') return undefined;
          return 'default-value';
        });

      await expect(aiAgent.execute.call(mockExecuteFunctions))
        .rejects.toThrow();
    });

    it('should work without optional connections', async () => {
      // Mock no memory or tools connected, but keep the ChatModel
      (mockExecuteFunctions.getInputConnectionData as any)
        .mockImplementation((connectionType: string, index: number) => {
          if (connectionType === NodeConnectionTypes.AiLanguageModel) {
            return persistentMockChatModel;
          }
          return null; // No memory or tools
        });

      // Mock Revenium tracking
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const result = await aiAgent.execute.call(mockExecuteFunctions);
      expect(result).toBeDefined();
      expect(result[0][0].json.response).toContain('I received'); // Realistic mock response
    });
  });
});
