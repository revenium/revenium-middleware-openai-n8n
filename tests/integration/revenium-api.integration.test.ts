/**
 * Integration tests for Revenium API communication
 * Tests API payload construction, authentication, error handling, and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupFetchMock,
  resetMocks,
  setupTestEnvironment,
  cleanupTestEnvironment,
  mockReveniumAPI,
  mockReveniumCredentials,
} from './setup.js';

// Import the API function from setup
import { sendToReveniumAPI } from './setup.js';

describe('Revenium API Integration Tests', () => {
  let fetchMock: any;

  beforeEach(() => {
    setupTestEnvironment();
    fetchMock = setupFetchMock();
  });

  afterEach(() => {
    resetMocks();
    cleanupTestEnvironment();
  });

  describe('API Payload Construction', () => {
    it('should construct complete API payload with all metadata', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const testPayload = {
        organizationName: 'test-org-123',
        subscriptionId: 'test-sub-456',
        productName: 'test-product-789',
        subscriberId: 'test-subscriber-abc',
        subscriberEmail: 'test@example.com',
        traceId: 'test-trace-xyz',
        taskType: 'chat_completion',
        agent: 'n8n-integration-test',
        model: 'gpt-4',
        provider: 'openai',
        inputTokenCount: 25,
        outputTokenCount: 15,
        totalTokenCount: 40,
        reasoningTokenCount: 5,
        cacheReadTokenCount: 10,
        audioInputTokens: 2,
        audioOutputTokens: 1,
        acceptedPredictionTokens: 0,
        rejectedPredictionTokens: 0,
        stopReason: 'END',
        duration: 1500,
        isStreamed: false,
        timeToFirstToken: 800,
        requestId: 'chatcmpl-test123',
        timestamp: new Date().toISOString(),
      };

      await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        testPayload
      );

      // Verify API call was made with correct structure
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v2/ai/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': mockReveniumCredentials.reveniumApiKey,
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('n8n-revenium'),
          }),
          body: expect.stringContaining('test-org-123'),
        })
      );

      // Verify payload structure
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody).toMatchObject({
        organizationName: 'test-org-123',
        subscriptionId: 'test-sub-456',
        productName: 'test-product-789',
        subscriberId: 'test-subscriber-abc',
        subscriberEmail: 'test@example.com',
        traceId: 'test-trace-xyz',
        taskType: 'chat_completion',
        agent: 'n8n-integration-test',
        model: 'gpt-4',
        provider: 'openai',
        inputTokenCount: 25,
        outputTokenCount: 15,
        totalTokenCount: 40,
        reasoningTokenCount: 5,
        cacheReadTokenCount: 10,
        stopReason: 'END',
        duration: 1500,
        isStreamed: false,
        timeToFirstToken: 800,
      });
    });

    it('should handle minimal payload with required fields only', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const minimalPayload = {
        organizationName: 'test-org-123',
        model: 'gpt-4',
        provider: 'openai',
        inputTokenCount: 10,
        outputTokenCount: 8,
        totalTokenCount: 18,
        duration: 1000,
        timestamp: new Date().toISOString(),
      };

      await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        minimalPayload
      );

      expect(fetchMock).toHaveBeenCalled();
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

      // Should include required fields
      expect(requestBody.organizationName).toBe('test-org-123');
      expect(requestBody.model).toBe('gpt-4');
      expect(requestBody.inputTokenCount).toBe(10);

      // Should handle missing optional fields gracefully
      expect(requestBody.subscriberId).toBeUndefined();
      expect(requestBody.traceId).toBeUndefined();
    });

    it('should handle subscriber credentials in payload', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const payloadWithCredentials = {
        organizationName: 'test-org-123',
        model: 'gpt-4',
        provider: 'openai',
        inputTokenCount: 10,
        outputTokenCount: 8,
        totalTokenCount: 18,
        duration: 1000,
        subscriber: {
          id: 'test-subscriber-abc',
          email: 'test@example.com',
          credential: {
            name: 'api-key',
            value: 'subscriber-key-123',
          },
        },
        timestamp: new Date().toISOString(),
      };

      await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        payloadWithCredentials
      );

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.subscriber).toMatchObject({
        id: 'test-subscriber-abc',
        email: 'test@example.com',
        credential: {
          name: 'api-key',
          value: 'subscriber-key-123',
        },
      });
    });
  });

  describe('Authentication and Headers', () => {
    it('should include correct authentication headers', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      await sendToReveniumAPI('https://api.revenium.ai', 'test-api-key-12345', {
        organizationName: 'test',
        model: 'gpt-4',
        provider: 'openai',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key-12345',
            'Content-Type': 'application/json',
            'User-Agent': expect.stringMatching(
              /n8n-revenium-middleware\/\d+\.\d+\.\d+/
            ),
          }),
        })
      );
    });

    it('should handle different base URL formats', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      // Test with trailing slash
      await sendToReveniumAPI('https://api.revenium.ai/', 'test-key', {
        organizationName: 'test',
        model: 'gpt-4',
        provider: 'openai',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenium.ai/meter/v2/ai/completions',
        expect.any(Object)
      );

      fetchMock.mockClear();

      // Test without trailing slash
      await sendToReveniumAPI('https://api.revenium.ai', 'test-key', {
        organizationName: 'test',
        model: 'gpt-4',
        provider: 'openai',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenium.ai/meter/v2/ai/completions',
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 400 Bad Request errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('{"error": "Invalid payload format"}'),
      });

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          { invalid: 'payload' }
        )
      ).rejects.toThrow('Revenium API error (400)');
    });

    it('should handle 401 Unauthorized errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{"error": "Invalid API key"}'),
      });

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          'invalid-api-key',
          { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
        )
      ).rejects.toThrow('Revenium API error (401)');
    });

    it('should handle 429 Rate Limit errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('{"error": "Rate limit exceeded"}'),
        headers: new Map([['Retry-After', '60']]),
      });

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
        )
      ).rejects.toThrow('Revenium API error (429)');
    });

    it('should handle 500 Server errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('{"error": "Internal server error"}'),
      });

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
        )
      ).rejects.toThrow('Revenium API error (500)');
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
        )
      ).rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      // Mock timeout by rejecting after delay
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 100)
          )
      );

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
        )
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('Response Handling', () => {
    it('should handle successful responses', async () => {
      const successResponse = {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('{"success": true, "transactionId": "txn-123"}'),
      };
      fetchMock.mockResolvedValue(successResponse);

      const result = await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
      );

      expect(result).toBeDefined();
    });

    it('should handle 202 Accepted responses', async () => {
      const acceptedResponse = {
        ok: true,
        status: 202,
        text: () =>
          Promise.resolve('{"accepted": true, "transactionId": "txn-456"}'),
      };
      fetchMock.mockResolvedValue(acceptedResponse);

      const result = await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
      );

      expect(result).toBeDefined();
    });

    it('should handle empty response bodies', async () => {
      const emptyResponse = {
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      };
      fetchMock.mockResolvedValue(emptyResponse);

      const result = await sendToReveniumAPI(
        mockReveniumCredentials.reveniumBaseUrl,
        mockReveniumCredentials.reveniumApiKey,
        { organizationName: 'test', model: 'gpt-4', provider: 'openai' }
      );

      expect(result).toBeDefined();
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle concurrent API calls', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const promises = Array.from({ length: 5 }, (_, i) =>
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          {
            organizationName: `test-${i}`,
            model: 'gpt-4',
            provider: 'openai',
            inputTokenCount: 10,
            outputTokenCount: 8,
            totalTokenCount: 18,
          }
        )
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should handle large payloads', async () => {
      fetchMock.mockResolvedValue(mockReveniumAPI.success);

      const largePayload = {
        organizationName: 'test-org-123',
        model: 'gpt-4',
        provider: 'openai',
        inputTokenCount: 10000,
        outputTokenCount: 5000,
        totalTokenCount: 15000,
        duration: 30000,
        metadata: {
          largeField: 'x'.repeat(10000), // Large string
        },
      };

      await expect(
        sendToReveniumAPI(
          mockReveniumCredentials.reveniumBaseUrl,
          mockReveniumCredentials.reveniumApiKey,
          largePayload
        )
      ).resolves.toBeDefined();
    });
  });
});
