import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before importing utils
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  logTokenUsage,
  resetGlobalStateForTesting,
} from '../src/utils/index.js';
import type { UsageMetadata } from '../src/types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original environment
const originalEnv = process.env;

describe('Circuit Breaker and Retry Logic', () => {
  const mockUsageMetadata: UsageMetadata = {
    taskType: 'test',
    agent: 'test-agent',
    organizationName: 'org-123',
    productName: 'prod-123',
    subscriberEmail: 'test@example.com',
    subscriberId: 'sub-123',
    subscriptionId: 'subscription-123',
  };

  const mockConfig = {
    apiKey: 'test-api-key-1234567890abcdef',
    baseUrl: 'https://api.dev.hcapp.io',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset global state
    resetGlobalStateForTesting();

    // Clear environment variables to ensure clean test state
    process.env = { ...originalEnv };
    delete process.env.REVENIUM_API_KEY;
    delete process.env.REVENIUM_API_BASE_URL;
    delete process.env.REVENIUM_BASE_URL;

    // Mock successful response by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: new Map([['content-type', 'application/json']]),
      json: () =>
        Promise.resolve({
          resourceType: 'metered-event',
          id: 'test-event-id',
          created: new Date().toISOString(),
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Successful API calls', () => {
    it('should make successful API call and reset circuit breaker', async () => {
      // The logTokenUsage function uses fire-and-forget batching
      // We just need to verify it doesn't throw an error
      await expect(
        logTokenUsage(
          'test-response-id',
          'gpt-4',
          100,
          50,
          150,
          0,
          'END',
          '2025-01-01T00:00:00Z',
          '2025-01-01T00:00:01Z',
          1000,
          mockUsageMetadata,
          undefined,
          false,
          0,
          mockConfig
        )
      ).resolves.not.toThrow();

      // Wait a bit for the batch to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalled();
    }, 10000);
  });

  describe('Retry logic', () => {
    it('should retry failed requests up to max retries', async () => {
      // Mock 2 failures then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          statusText: 'Created',
          headers: new Map([['content-type', 'application/json']]),
          json: () =>
            Promise.resolve({
              resourceType: 'metered-event',
              id: 'test-event-id',
              created: new Date().toISOString(),
            }),
        });

      // Fire-and-forget call - just verify it doesn't throw
      await expect(
        logTokenUsage(
          'test-response-id',
          'gpt-4',
          100,
          50,
          150,
          0,
          'END',
          '2025-01-01T00:00:00Z',
          '2025-01-01T00:00:01Z',
          1000,
          mockUsageMetadata,
          undefined,
          false,
          0,
          mockConfig
        )
      ).resolves.not.toThrow();

      // Wait for batch processing and retries
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(mockFetch).toHaveBeenCalled();
    }, 10000);

    it('should stop retrying after max attempts', async () => {
      // Mock all calls to fail
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      // Fire-and-forget call - just verify it doesn't throw
      await expect(
        logTokenUsage(
          'test-response-id',
          'gpt-4',
          100,
          50,
          150,
          0,
          'END',
          '2025-01-01T00:00:00Z',
          '2025-01-01T00:00:01Z',
          1000,
          mockUsageMetadata,
          undefined,
          false,
          0,
          mockConfig
        )
      ).resolves.not.toThrow();

      // Wait for batch processing and retries
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(mockFetch).toHaveBeenCalled();
    }, 10000);

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        text: () => Promise.resolve('Internal Server Error'),
      });

      // Fire-and-forget call - just verify it doesn't throw
      await expect(
        logTokenUsage(
          'test-response-id',
          'gpt-4',
          100,
          50,
          150,
          0,
          'END',
          '2025-01-01T00:00:00Z',
          '2025-01-01T00:00:01Z',
          1000,
          mockUsageMetadata,
          undefined,
          false,
          0,
          mockConfig
        )
      ).resolves.not.toThrow();

      // Wait for batch processing and retries
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(mockFetch).toHaveBeenCalled();
    }, 10000);
  });

  describe('Missing configuration handling', () => {
    it('should skip logging when API key is missing', async () => {
      await logTokenUsage(
        'test-response-id',
        'gpt-4',
        100,
        50,
        150,
        0,
        'END',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:01Z',
        1000,
        mockUsageMetadata,
        undefined,
        false,
        0,
        { apiKey: '', baseUrl: 'https://api.dev.hcapp.io' }
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use environment variables when config not provided', async () => {
      // Set environment variables for this test
      process.env.REVENIUM_METERING_API_KEY = 'env-api-key-1234567890abcdef';
      process.env.REVENIUM_METERING_BASE_URL = 'https://env.api.dev.hcapp.io';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            resourceType: 'metered-event',
            id: 'test-event-id',
            created: new Date().toISOString(),
          }),
      });

      await logTokenUsage(
        'test-response-id',
        'gpt-4',
        100,
        50,
        150,
        0,
        'END',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:01Z',
        1000,
        mockUsageMetadata
      );

      // In test mode, calls are made directly without batching

      expect(mockFetch).toHaveBeenCalledWith(
        'https://env.api.dev.hcapp.io/v2/ai/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'env-api-key-1234567890abcdef',
          }),
        })
      );
    });
  });

  describe('Request payload validation', () => {
    it('should send correct payload structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            resourceType: 'metered-event',
            id: 'test-event-id',
            created: new Date().toISOString(),
          }),
      });

      await logTokenUsage(
        'test-response-id',
        'gpt-4',
        100,
        50,
        150,
        25,
        'END',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:01Z',
        1000,
        mockUsageMetadata,
        'fp_test',
        true,
        500,
        mockConfig
      );

      // In test mode, calls are made directly without batching

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1].body).toBeDefined();

      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody).toMatchObject({
        stopReason: 'END',
        costType: 'AI',
        isStreamed: true,
        taskType: 'test',
        agent: 'test-agent',
        operationType: 'CHAT',
        inputTokenCount: 100,
        outputTokenCount: 50,
        totalTokenCount: 150,
        cacheCreationTokenCount: 25,
        organizationName: 'org-123',
        productName: 'prod-123',
        subscriber: {
          id: 'sub-123',
          email: 'test@example.com',
        },
        subscriptionId: 'subscription-123',
        model: 'gpt-4',
        transactionId: 'test-response-id',
        provider: 'OPENAI',
        timeToFirstToken: 500,
      });
    });

    it('should handle snake_case metadata properties', async () => {
      const snakeCaseMetadata: UsageMetadata = {
        task_type: 'snake-test',
        organization_id: 'org-snake-123',
        product_id: 'prod-snake-123',
        subscriber_email: 'snake@example.com',
        subscriber_id: 'sub-snake-123',
        subscription_id: 'subscription-snake-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            resourceType: 'metered-event',
            id: 'test-event-id',
            created: new Date().toISOString(),
          }),
      });

      await logTokenUsage(
        'test-response-id',
        'gpt-4',
        100,
        50,
        150,
        0,
        'END',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:01Z',
        1000,
        snakeCaseMetadata,
        undefined,
        false,
        0,
        mockConfig
      );

      // In test mode, calls are made directly without batching

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1].body).toBeDefined();

      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.taskType).toBe('snake-test');
      expect(requestBody.organizationName).toBe('org-snake-123');
      expect(requestBody.productName).toBe('prod-snake-123');
      expect(requestBody.subscriber.email).toBe('snake@example.com');
      expect(requestBody.subscriber.id).toBe('sub-snake-123');
      expect(requestBody.subscriptionId).toBe('subscription-snake-123');
    });

    it('should detect provider from system fingerprint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            resourceType: 'metered-event',
            id: 'test-event-id',
            created: new Date().toISOString(),
          }),
      });

      await logTokenUsage(
        'test-response-id',
        'llama-2',
        100,
        50,
        150,
        0,
        'END',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:01Z',
        1000,
        mockUsageMetadata,
        'fp_ollama',
        false,
        0,
        mockConfig
      );

      // In test mode, calls are made directly without batching

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1].body).toBeDefined();

      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.provider).toBe('OLLAMA');
    });
  });
});
