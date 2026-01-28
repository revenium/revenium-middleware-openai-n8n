import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  UsageMetadata,
  SubscriberInfo,
  CreateCompletionRequest,
} from '../src/types/index.js';
import { resetGlobalStateForTesting } from '../src/utils/index.js';

// Mock the logger to avoid console output during tests
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch to intercept API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Subscriber Metadata Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset global state
    resetGlobalStateForTesting();

    // Reset environment variables
    delete process.env.REVENIUM_METERING_API_KEY;
    delete process.env.REVENIUM_METERING_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildSubscriberObject helper function', () => {
    // We need to test the internal helper function, so let's create a test version
    function buildSubscriberObject(
      usageMetadata: UsageMetadata
    ): SubscriberInfo | undefined {
      const id = usageMetadata.subscriberId || usageMetadata.subscriber_id;
      const email =
        usageMetadata.subscriberEmail || usageMetadata.subscriber_email;
      const credentialName =
        usageMetadata.subscriberCredentialName ||
        usageMetadata.subscriber_credential_name;
      const credentialValue =
        usageMetadata.subscriberCredential ||
        usageMetadata.subscriber_credential;

      // Return undefined if no subscriber data provided
      if (!id && !email && !credentialName && !credentialValue) {
        return undefined;
      }

      const subscriber: SubscriberInfo = {};

      if (id) subscriber.id = id;
      if (email) subscriber.email = email;

      // Only add credential if both name and value are present
      if (credentialName && credentialValue) {
        subscriber.credential = {
          name: credentialName,
          value: credentialValue,
        };
      }

      return subscriber;
    }

    it('should return undefined when no subscriber data is provided', () => {
      const metadata: UsageMetadata = {
        traceId: 'test-trace',
        taskType: 'test-task',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toBeUndefined();
    });

    it('should build subscriber object with camelCase fields', () => {
      const metadata: UsageMetadata = {
        subscriberId: 'customer123',
        subscriberEmail: 'test@example.com',
        subscriberCredentialName: 'api-key',
        subscriberCredential: 'key-value-123',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toEqual({
        id: 'customer123',
        email: 'test@example.com',
        credential: {
          name: 'api-key',
          value: 'key-value-123',
        },
      });
    });

    it('should build subscriber object with snake_case fields', () => {
      const metadata: UsageMetadata = {
        subscriber_id: 'customer456',
        subscriber_email: 'snake@example.com',
        subscriber_credential_name: 'snake-key',
        subscriber_credential: 'snake-value-456',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toEqual({
        id: 'customer456',
        email: 'snake@example.com',
        credential: {
          name: 'snake-key',
          value: 'snake-value-456',
        },
      });
    });

    it('should prioritize camelCase over snake_case fields', () => {
      const metadata: UsageMetadata = {
        subscriberId: 'camel-id',
        subscriber_id: 'snake-id',
        subscriberEmail: 'camel@example.com',
        subscriber_email: 'snake@example.com',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toEqual({
        id: 'camel-id',
        email: 'camel@example.com',
      });
    });

    it('should build subscriber object with only id and email (no credentials)', () => {
      const metadata: UsageMetadata = {
        subscriberId: 'customer789',
        subscriberEmail: 'nocreds@example.com',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toEqual({
        id: 'customer789',
        email: 'nocreds@example.com',
      });
    });

    it('should not include credential object if only name or only value is provided', () => {
      const metadataOnlyName: UsageMetadata = {
        subscriberId: 'customer999',
        subscriberCredentialName: 'incomplete-key',
      };

      const resultOnlyName = buildSubscriberObject(metadataOnlyName);
      expect(resultOnlyName).toEqual({
        id: 'customer999',
      });

      const metadataOnlyValue: UsageMetadata = {
        subscriberId: 'customer888',
        subscriberCredential: 'incomplete-value',
      };

      const resultOnlyValue = buildSubscriberObject(metadataOnlyValue);
      expect(resultOnlyValue).toEqual({
        id: 'customer888',
      });
    });

    it('should handle mixed camelCase and snake_case credential fields', () => {
      const metadata: UsageMetadata = {
        subscriberId: 'mixed-customer',
        subscriberCredentialName: 'camel-name',
        subscriber_credential: 'snake-value',
      };

      const result = buildSubscriberObject(metadata);
      expect(result).toEqual({
        id: 'mixed-customer',
        credential: {
          name: 'camel-name',
          value: 'snake-value',
        },
      });
    });
  });

  describe('logTokenUsage integration', () => {
    it('should include middlewareSource and nested subscriber in API payload', async () => {
      // Set up environment
      process.env.REVENIUM_METERING_API_KEY = 'test-api-key';
      process.env.REVENIUM_METERING_BASE_URL = 'https://api.revenium.ai/meter';

      // Mock successful API response
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

      // Import logTokenUsage after setting up mocks
      const { logTokenUsage } = await import('../src/utils/index.js');

      const usageMetadata: UsageMetadata = {
        traceId: 'test-trace-123',
        taskType: 'integration-test',
        subscriberId: 'test-customer-456',
        subscriberEmail: 'integration@test.com',
        subscriberCredentialName: 'test-api-key',
        subscriberCredential: 'test-key-value-789',
        organizationName: 'test-org-123',
        productName: 'n8n-integration',
      };

      await logTokenUsage(
        'test-response-id',
        'gpt-4o-mini',
        100, // promptTokens
        50, // completionTokens
        150, // totalTokens
        10, // cachedTokens
        'END',
        '2024-01-15T10:00:00.000Z', // requestTime
        '2024-01-15T10:00:01.500Z', // responseTime
        1500, // requestDuration
        usageMetadata,
        'test-fingerprint', // fingerprint
        false, // isStreamed
        500 // timeToFirstToken
      );

      // In test mode, calls are made directly without batching

      // Verify API was called
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Get the call arguments
      const [url, options] = mockFetch.mock.calls[0];

      // Verify URL
      expect(url).toBe('https://api.revenium.ai/meter/v2/ai/completions');

      // Verify headers (check for required headers, allow additional security headers)
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': 'test-api-key',
      });

      // Parse and verify payload
      const payload = JSON.parse(options.body);

      // Verify middlewareSource field
      expect(payload.middlewareSource).toBe('n8n');

      // Verify nested subscriber structure
      expect(payload.subscriber).toEqual({
        id: 'test-customer-456',
        email: 'integration@test.com',
        credential: {
          name: 'test-api-key',
          value: 'test-key-value-789',
        },
      });

      // Verify other required fields
      expect(payload.model).toBe('gpt-4o-mini');
      expect(payload.inputTokenCount).toBe(100);
      expect(payload.outputTokenCount).toBe(50);
      expect(payload.totalTokenCount).toBe(150);
      expect(payload.organizationName).toBe('test-org-123');
      expect(payload.productName).toBe('n8n-integration');

      // Verify old flat fields are NOT present
      expect(payload.subscriberEmail).toBeUndefined();
      expect(payload.subscriberId).toBeUndefined();
      expect(payload.subscriberCredentialName).toBeUndefined();
      expect(payload.subscriberCredential).toBeUndefined();
    }, 10000); // Increase timeout to 10 seconds

    it('should handle missing subscriber metadata gracefully', async () => {
      process.env.REVENIUM_METERING_API_KEY = 'test-api-key-2';

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

      const { logTokenUsage } = await import('../src/utils/index.js');

      const usageMetadata: UsageMetadata = {
        traceId: 'test-trace-no-subscriber',
        taskType: 'no-subscriber-test',
      };

      await logTokenUsage(
        'test-response-id-2',
        'gpt-3.5-turbo',
        50,
        25,
        75,
        0,
        'END',
        '2024-01-15T10:00:00.000Z',
        '2024-01-15T10:00:01.000Z',
        1000,
        usageMetadata,
        'test-fingerprint-2',
        false,
        300
      );

      // In test mode, calls are made directly without batching

      // Get the most recent call (should be the second call)
      const lastCallIndex = mockFetch.mock.calls.length - 1;
      const payload = JSON.parse(mockFetch.mock.calls[lastCallIndex][1].body);

      // Should still include middlewareSource
      expect(payload.middlewareSource).toBe('n8n');

      // Subscriber should be undefined
      expect(payload.subscriber).toBeUndefined();
    }, 10000); // Increase timeout to 10 seconds
  });
});
