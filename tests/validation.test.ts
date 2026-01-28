import { describe, it, expect } from 'vitest';
import {
  validateCredentials,
  validateApiKey,
  validateModelName,
  validateNumericParameter,
  validateTimeout,
  validateSecureUrl
} from '../src/utils/index.js';

describe('Validation Functions', () => {
  describe('validateApiKey', () => {
    it('should accept valid OpenAI API key', () => {
      expect(() => validateApiKey('sk-1234567890abcdef1234567890abcdef', 'OpenAI API key')).not.toThrow();
    });

    it('should accept valid Revenium API key', () => {
      expect(() => validateApiKey('rev_1234567890abcdef1234567890abcdef', 'Revenium API key')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateApiKey('', 'API key')).toThrow('API key must be a non-empty string');
    });

    it('should reject whitespace only', () => {
      expect(() => validateApiKey('   ', 'API key')).toThrow('API key cannot be empty or only whitespace');
    });

    it('should reject short keys', () => {
      expect(() => validateApiKey('short', 'API key')).toThrow('API key appears too short');
    });

    it('should reject placeholder values', () => {
      expect(() => validateApiKey('your-api-key-here-replace-me', 'API key')).toThrow('API key appears to be a placeholder value');
    });

    it('should reject OpenAI keys without sk- prefix', () => {
      expect(() => validateApiKey('1234567890abcdef1234567890abcdef', 'OpenAI API key')).toThrow('OpenAI API keys must start with');
    });

    it('should reject non-string values', () => {
      expect(() => validateApiKey(null as any, 'API key')).toThrow('API key must be a non-empty string');
      expect(() => validateApiKey(123 as any, 'API key')).toThrow('API key must be a non-empty string');
    });
  });

  describe('validateModelName', () => {
    it('should accept valid model names', () => {
      expect(() => validateModelName('gpt-4')).not.toThrow();
      expect(() => validateModelName('gpt-3.5-turbo')).not.toThrow();
      expect(() => validateModelName('claude-3-opus')).not.toThrow();
      expect(() => validateModelName('model_name_123')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateModelName('')).toThrow('model name: must be a non-empty string');
    });

    it('should reject whitespace only', () => {
      expect(() => validateModelName('   ')).toThrow('model name: cannot be empty or only whitespace');
    });

    it('should reject invalid characters', () => {
      expect(() => validateModelName('model@name')).toThrow('model name: can only contain letters, numbers, dots, hyphens, and underscores');
      expect(() => validateModelName('model name')).toThrow('model name: can only contain letters, numbers, dots, hyphens, and underscores');
      expect(() => validateModelName('model/name')).toThrow('model name: can only contain letters, numbers, dots, hyphens, and underscores');
    });

    it('should reject very long names', () => {
      const longName = 'a'.repeat(101);
      expect(() => validateModelName(longName)).toThrow('model name: maximum length is 100 characters');
    });

    it('should reject non-string values', () => {
      expect(() => validateModelName(null as any)).toThrow('model name: must be a non-empty string');
      expect(() => validateModelName(123 as any)).toThrow('model name: must be a non-empty string');
    });
  });

  describe('validateNumericParameter', () => {
    it('should accept valid numbers within range', () => {
      expect(() => validateNumericParameter(0.5, 'temperature', 0, 2)).not.toThrow();
      expect(() => validateNumericParameter(1000, 'maxTokens', 1, 100000)).not.toThrow();
      expect(() => validateNumericParameter(0, 'min value', 0, 10)).not.toThrow();
      expect(() => validateNumericParameter(10, 'max value', 0, 10)).not.toThrow();
    });

    it('should accept undefined when allowed', () => {
      expect(() => validateNumericParameter(undefined, 'optional param', 0, 10, true)).not.toThrow();
    });

    it('should reject undefined when not allowed', () => {
      expect(() => validateNumericParameter(undefined, 'required param', 0, 10, false)).toThrow('required param: parameter is required');
    });

    it('should reject non-numeric values', () => {
      expect(() => validateNumericParameter('5', 'param', 0, 10)).toThrow('param: must be a number');
      expect(() => validateNumericParameter(null, 'param', 0, 10)).toThrow('param: parameter is required');
      expect(() => validateNumericParameter({}, 'param', 0, 10)).toThrow('param: must be a number');
    });

    it('should reject NaN and infinite values', () => {
      expect(() => validateNumericParameter(NaN, 'param', 0, 10)).toThrow('param: must be a finite number');
      expect(() => validateNumericParameter(Infinity, 'param', 0, 10)).toThrow('param: must be a finite number');
      expect(() => validateNumericParameter(-Infinity, 'param', 0, 10)).toThrow('param: must be a finite number');
    });

    it('should reject values outside range', () => {
      expect(() => validateNumericParameter(-1, 'param', 0, 10)).toThrow('param: must be between 0 and 10');
      expect(() => validateNumericParameter(11, 'param', 0, 10)).toThrow('param: must be between 0 and 10');
    });
  });

  describe('validateTimeout', () => {
    it('should accept valid timeout values', () => {
      expect(() => validateTimeout(1000)).not.toThrow(); // 1 second
      expect(() => validateTimeout(60000)).not.toThrow(); // 1 minute
      expect(() => validateTimeout(600000)).not.toThrow(); // 10 minutes
    });

    it('should accept undefined when allowed', () => {
      expect(() => validateTimeout(undefined, true)).not.toThrow();
    });

    it('should reject undefined when not allowed', () => {
      expect(() => validateTimeout(undefined, false)).toThrow('timeout: parameter is required');
    });

    it('should reject negative values', () => {
      expect(() => validateTimeout(-1)).toThrow('timeout: cannot be negative');
    });

    it('should reject values above maximum', () => {
      // 24 hours is the max (24 * 60 * 60 * 1000 = 86400000)
      expect(() => validateTimeout(100000000)).toThrow('timeout: cannot exceed 24 hours');
    });

    it('should reject non-numeric values', () => {
      expect(() => validateTimeout('5000')).toThrow('timeout: must be a number');
    });

    it('should reject NaN and infinite values', () => {
      expect(() => validateTimeout(NaN)).toThrow('timeout: must be a finite number');
      expect(() => validateTimeout(Infinity)).toThrow('timeout: must be a finite number');
    });
  });

  describe('validateSecureUrl', () => {
    const allowedUrls = ['https://api.openai.com/v1', 'https://api.openai.com'];

    it('should accept valid URLs in allowlist', () => {
      expect(() => validateSecureUrl('https://api.openai.com/v1', allowedUrls, 'OpenAI URL')).not.toThrow();
      expect(() => validateSecureUrl('https://api.openai.com', allowedUrls, 'OpenAI URL')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateSecureUrl('', allowedUrls, 'URL')).toThrow('URL must be a non-empty string');
    });

    it('should reject invalid URL format', () => {
      expect(() => validateSecureUrl('not-a-url', allowedUrls, 'URL')).toThrow('URL format is invalid');
    });

    it('should reject HTTP URLs', () => {
      expect(() => validateSecureUrl('http://api.openai.com', allowedUrls, 'URL')).toThrow('Only HTTPS URLs are allowed');
    });

    it('should reject URLs not in allowlist', () => {
      expect(() => validateSecureUrl('https://malicious.com', allowedUrls, 'URL')).toThrow('URL not in allowlist');
    });

    it('should reject non-string values', () => {
      expect(() => validateSecureUrl(null as any, allowedUrls, 'URL')).toThrow('URL must be a non-empty string');
    });
  });

  describe('validateCredentials', () => {
    const validCredentials = {
      openaiApiKey: 'sk-1234567890abcdef1234567890abcdef',
      reveniumApiKey: 'rev_1234567890abcdef1234567890abcdef',
      reveniumBaseUrl: 'https://api.dev.hcapp.io',
      openaiBaseUrl: 'https://api.openai.com/v1'
    };

    it('should accept valid credentials', () => {
      expect(() => validateCredentials(validCredentials)).not.toThrow();
    });

    it('should accept credentials without optional openaiBaseUrl', () => {
      const { openaiBaseUrl, ...creds } = validCredentials;
      expect(() => validateCredentials(creds)).not.toThrow();
    });

    it('should reject null or undefined', () => {
      expect(() => validateCredentials(null)).toThrow('credentials: must be an object');
      expect(() => validateCredentials(undefined)).toThrow('credentials: must be an object');
    });

    it('should reject missing required fields', () => {
      expect(() => validateCredentials({})).toThrow('openaiApiKey is required');
      
      const { openaiApiKey, ...withoutOpenAI } = validCredentials;
      expect(() => validateCredentials(withoutOpenAI)).toThrow('openaiApiKey is required');
      
      const { reveniumApiKey, ...withoutRevenium } = validCredentials;
      expect(() => validateCredentials(withoutRevenium)).toThrow('reveniumApiKey is required');
      
      const { reveniumBaseUrl, ...withoutBaseUrl } = validCredentials;
      expect(() => validateCredentials(withoutBaseUrl)).toThrow('reveniumBaseUrl is required');
    });

    it('should reject invalid API keys', () => {
      const invalidOpenAI = { ...validCredentials, openaiApiKey: 'invalid-key' };
      expect(() => validateCredentials(invalidOpenAI)).toThrow('API key appears too short');

      const invalidRevenium = { ...validCredentials, reveniumApiKey: 'short' };
      expect(() => validateCredentials(invalidRevenium)).toThrow('API key appears too short');
    });

    it('should reject invalid URLs', () => {
      const invalidReveniumUrl = { ...validCredentials, reveniumBaseUrl: 'http://insecure.com' };
      expect(() => validateCredentials(invalidReveniumUrl)).toThrow('Only HTTPS URLs are allowed');
      
      const invalidOpenAIUrl = { ...validCredentials, openaiBaseUrl: 'https://malicious.com' };
      expect(() => validateCredentials(invalidOpenAIUrl)).toThrow('URL not in allowlist');
    });
  });
});
