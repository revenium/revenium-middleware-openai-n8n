/**
 * Integration tests for ReveniumOpenAIChatModel node
 * Tests end-to-end functionality including n8n node integration, LangChain ChatModel supply, and Revenium tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { ReveniumOpenAIChatModel } from '../../nodes/ReveniumOpenAIChatModel/ReveniumOpenAIChatModel.node.js';
import {
  setupFetchMock,
  resetMocks,
  setupTestEnvironment,
  cleanupTestEnvironment,
  mockReveniumAPI,
  mockReveniumCredentials,
  createMockSupplyDataFunctions
} from './setup.js';

describe('ReveniumOpenAIChatModel Integration Tests', () => {
  let chatModelNode: ReveniumOpenAIChatModel;
  let mockSupplyDataFunctions: any;
  let fetchMock: any;

  beforeEach(() => {
    setupTestEnvironment();
    fetchMock = setupFetchMock();

    // Create the n8n node instance
    chatModelNode = new ReveniumOpenAIChatModel();

    // Create mock supply data functions
    mockSupplyDataFunctions = createMockSupplyDataFunctions();

    // Setup mock credentials
    mockSupplyDataFunctions.getCredentials.mockResolvedValue(mockReveniumCredentials);

    // Setup mock node parameters
    mockSupplyDataFunctions.getNodeParameter.mockImplementation((paramName: string) => {
      switch (paramName) {
        case 'model': return 'byId';
        case 'modelId': return 'gpt-4';
        case 'options': return {
          temperature: 0.7,
          maxTokens: 1000,
          streaming: false,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          timeout: 30000
        };
        case 'usageMetadata': return {};
        default: return undefined;
      }
    });
  });

  afterEach(() => {
    resetMocks();
    cleanupTestEnvironment();
  });

  describe('n8n Node Integration', () => {
    it('should supply a working ChatModel via supplyData', async () => {
      // Mock successful credential validation
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      // Call supplyData to get the ChatModel
      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);

      // Verify the supply result
      expect(supplyResult).toBeDefined();
      expect(supplyResult.response).toBeDefined();
      expect(typeof supplyResult.response._llmType === 'function' ?
        supplyResult.response._llmType() : supplyResult.response._llmType).toBe('openai');

      // Verify credentials were loaded
      expect(mockSupplyDataFunctions.getCredentials).toHaveBeenCalledWith('reveniumOpenAI');
    });

    it('should handle credential validation errors', async () => {
      // Mock invalid credentials
      mockSupplyDataFunctions.getCredentials.mockResolvedValue({
        reveniumApiKey: '', // Invalid empty key
        reveniumBaseUrl: 'https://api.revenium.ai'
      });

      // Should throw validation error
      await expect(chatModelNode.supplyData.call(mockSupplyDataFunctions, 0))
        .rejects.toThrow();
    });

    it('should configure ChatModel with node parameters', async () => {
      // Mock different parameters
      mockSupplyDataFunctions.getNodeParameter.mockImplementation((paramName: string) => {
        switch (paramName) {
          case 'model': return 'byId';
          case 'modelId': return 'gpt-3.5-turbo';
          case 'options': return {
            temperature: 0.5,
            maxTokens: 500,
            streaming: true
          };
          case 'usageMetadata': return {};
          default: return undefined;
        }
      });

      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      const chatModel = supplyResult.response;

      // Verify configuration was applied
      expect(chatModel.model).toBe('gpt-3.5-turbo'); // Changed from modelName to model
      expect(chatModel.temperature).toBe(0.5);
      expect(chatModel.maxTokens).toBe(500);
      // Note: streaming configuration is handled internally by LangChain
    });

    it('should handle missing optional parameters gracefully', async () => {
      // Mock minimal parameters
      mockSupplyDataFunctions.getNodeParameter.mockImplementation((paramName: string) => {
        switch (paramName) {
          case 'model': return 'byId';
          case 'modelId': return 'gpt-4';
          case 'options': return {}; // Empty options should use defaults
          case 'usageMetadata': return {};
          // All other parameters return undefined
          default: return undefined;
        }
      });

      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      const chatModel = supplyResult.response;

      // Should still work with minimal configuration
      expect(chatModel).toBeDefined();
      expect(chatModel.model).toBe('gpt-4'); // Changed from modelName to model
      // Should use default values for undefined parameters
      expect(chatModel.temperature).toBeDefined();
    });

  });

  describe('ChatModel Functionality Integration', () => {
    it('should create a functional ChatModel that can be used with LangChain', async () => {
      // Mock OpenAI API response for actual usage
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json'
          }),
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: 'Hello! How can I help you today?',
                role: 'assistant'
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 8,
              total_tokens: 18
            },
            model: 'gpt-4',
            id: 'chatcmpl-test123'
          })
        })
        .mockResolvedValueOnce(mockReveniumAPI.success);

      // Get the ChatModel from the node
      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      const chatModel = supplyResult.response;

      // Test that the ChatModel can actually be invoked
      const messages = [new HumanMessage('Hello, how are you?')];
      const result = await chatModel.invoke(messages);

      // Verify the result
      expect(result).toBeDefined();
      expect(result.content).toBe('Hello! How can I help you today?');

      // Verify OpenAI API was called
      const openAICall = fetchMock.mock.calls.find((call: any) =>
        call[0].includes('openai.com') || call[0].includes('api.openai.com')
      );
      expect(openAICall).toBeDefined();

      // Wait for potential Revenium tracking
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle streaming configuration', async () => {
      // Enable streaming in node parameters
      mockSupplyDataFunctions.getNodeParameter.mockImplementation((paramName: string) => {
        switch (paramName) {
          case 'model': return 'byId';
          case 'modelId': return 'gpt-4';
          case 'options': return {
            streaming: true
          };
          case 'usageMetadata': return {};
          default: return undefined;
        }
      });

      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      const chatModel = supplyResult.response;

      // Verify ChatModel was created successfully
      expect(chatModel).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API key validation errors', async () => {
      // Mock credentials with invalid OpenAI key
      mockSupplyDataFunctions.getCredentials.mockResolvedValue({
        ...mockReveniumCredentials,
        openaiApiKey: '' // Invalid empty key
      });

      // Should throw validation error
      await expect(chatModelNode.supplyData.call(mockSupplyDataFunctions, 0))
        .rejects.toThrow();
    });

    it('should handle network errors during credential validation', async () => {
      // Mock network error
      fetchMock.mockRejectedValue(new Error('Network error'));

      // Should still create the ChatModel (Revenium validation is non-blocking)
      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      expect(supplyResult.response).toBeDefined();
    });
  });

  describe('Real Integration Scenarios', () => {
    it('should work in a typical n8n workflow scenario', async () => {
      // Simulate a real n8n workflow where:
      // 1. Node is configured with parameters
      // 2. Credentials are loaded
      // 3. ChatModel is supplied to other nodes
      // 4. ChatModel is used for actual AI operations

      // Step 1: Configure node with realistic parameters
      mockSupplyDataFunctions.getNodeParameter.mockImplementation((paramName: string) => {
        switch (paramName) {
          case 'model': return 'byId';
          case 'modelId': return 'gpt-4';
          case 'options': return {
            temperature: 0.8,
            maxTokens: 2000,
            systemPrompt: 'You are a helpful assistant.'
          };
          case 'usageMetadata': return {};
          default: return undefined;
        }
      });

      // Step 2: Mock successful API responses
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json'
          }),
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: 'I am a helpful AI assistant. How can I help you today?',
                role: 'assistant'
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 12,
              total_tokens: 27
            },
            model: 'gpt-4'
          })
        })
        .mockResolvedValueOnce(mockReveniumAPI.success);

      // Step 3: Get ChatModel from node
      const supplyResult = await chatModelNode.supplyData.call(mockSupplyDataFunctions, 0);
      const chatModel = supplyResult.response;

      // Step 4: Use ChatModel in realistic scenario
      const userMessage = new HumanMessage('Hello, I need help with a task.');
      const response = await chatModel.invoke([userMessage]);

      // Verify end-to-end functionality
      expect(response.content).toContain('helpful AI assistant');
      expect(mockSupplyDataFunctions.getCredentials).toHaveBeenCalled();

      // Verify OpenAI API was called with correct configuration
      const openAICall = fetchMock.mock.calls.find((call: any) =>
        call[0].includes('openai.com') || call[0].includes('api.openai.com')
      );
      expect(openAICall).toBeDefined();

      // Wait for Revenium tracking
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
});
