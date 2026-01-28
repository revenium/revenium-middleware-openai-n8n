import { describe, it, expect } from 'vitest';
import { buildReveniumUrl, isValidUrl } from '../src/utils/url-builder.js';

describe('URL Builder', () => {
  describe('buildReveniumUrl', () => {
    it('should append /meter/v2 when base URL has neither', () => {
      const result = buildReveniumUrl('https://api.revenium.ai', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/meter/v2/ai/completions');
    });

    it('should append /v2 when base URL has /meter only', () => {
      const result = buildReveniumUrl('https://api.revenium.ai/meter', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/meter/v2/ai/completions');
    });

    it('should append endpoint as-is when base URL has /meter/v2', () => {
      const result = buildReveniumUrl('https://api.revenium.ai/meter/v2', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/meter/v2/ai/completions');
    });

    it('should handle trailing slashes in base URL', () => {
      const result = buildReveniumUrl('https://api.revenium.ai/', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/meter/v2/ai/completions');
    });

    it('should handle multiple trailing slashes', () => {
      const result = buildReveniumUrl('https://api.revenium.ai///', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/meter/v2/ai/completions');
    });

    it('should handle dev environment URLs', () => {
      const result = buildReveniumUrl('https://api.dev.hcapp.io', '/ai/completions');
      expect(result).toBe('https://api.dev.hcapp.io/meter/v2/ai/completions');
    });

    it('should be case-insensitive for path detection', () => {
      const result = buildReveniumUrl('https://api.revenium.ai/METER', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/METER/v2/ai/completions');
    });

    it('should handle /v2 at end without /meter', () => {
      const result = buildReveniumUrl('https://api.revenium.ai/v2', '/ai/completions');
      expect(result).toBe('https://api.revenium.ai/v2/ai/completions');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://api.revenium.ai')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });
});
