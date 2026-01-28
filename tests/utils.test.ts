import { describe, it, expect } from 'vitest';
import { getStopReason, getISOTimestamp, calculateDuration } from '../src/utils/index.js';

describe('Revenium Utilities', () => {
  describe('getStopReason', () => {
    it('should map stop to END', () => {
      expect(getStopReason('stop')).toBe('END');
    });

    it('should map function_call to END_SEQUENCE', () => {
      expect(getStopReason('function_call')).toBe('END_SEQUENCE');
    });

    it('should map tool_calls to END_SEQUENCE', () => {
      expect(getStopReason('tool_calls')).toBe('END_SEQUENCE');
    });

    it('should map length to TOKEN_LIMIT', () => {
      expect(getStopReason('length')).toBe('TOKEN_LIMIT');
    });

    it('should map content_filter to ERROR', () => {
      expect(getStopReason('content_filter')).toBe('ERROR');
    });

    it('should default to END for unknown reasons', () => {
      expect(getStopReason(null)).toBe('END');
      expect(getStopReason(undefined)).toBe('END');
      expect(getStopReason('unknown' as any)).toBe('END');
    });
  });

  describe('getISOTimestamp', () => {
    it('should return ISO string for current date', () => {
      const timestamp = getISOTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return ISO string for provided date', () => {
      const date = new Date('2025-05-30T16:32:02.018Z');
      const timestamp = getISOTimestamp(date);
      expect(timestamp).toBe('2025-05-30T16:32:02.018Z');
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration in milliseconds', () => {
      const start = new Date('2025-05-30T16:32:01.183Z');
      const end = new Date('2025-05-30T16:32:02.018Z');
      const duration = calculateDuration(start, end);
      expect(duration).toBe(835);
    });

    it('should handle same timestamps', () => {
      const date = new Date('2025-05-30T16:32:01.183Z');
      const duration = calculateDuration(date, date);
      expect(duration).toBe(0);
    });
  });
}); 