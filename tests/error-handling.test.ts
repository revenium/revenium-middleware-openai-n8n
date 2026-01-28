import { describe, it, expect } from 'vitest';
import {
  createReveniumError,
  getErrorMessage,
  getErrorDetails
} from '../src/utils/index.js';

describe('Error Handling', () => {
  describe('createReveniumError', () => {
    it('should create basic ReveniumError', () => {
      const error = createReveniumError('Test error message');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ReveniumError');
      expect(error.message).toBe('Test error message');
      expect(error.code).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create ReveniumError with code and status', () => {
      const error = createReveniumError('API error', undefined, 'API_ERROR', 500);
      
      expect(error.name).toBe('ReveniumError');
      expect(error.message).toBe('API error');
      expect(error.code).toBe('API_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create ReveniumError with cause', () => {
      const originalError = new Error('Original error');
      const error = createReveniumError('Wrapped error', originalError, 'WRAPPED_ERROR');
      
      expect(error.name).toBe('ReveniumError');
      expect(error.message).toBe('Wrapped error');
      expect(error.code).toBe('WRAPPED_ERROR');
      expect(error.cause).toBe(originalError);
      expect(error.stack).toContain('Caused by:');
    });

    it('should handle non-Error cause objects', () => {
      const cause = { message: 'Non-error cause' };
      const error = createReveniumError('Test error', cause);
      
      expect(error.cause).toBe(cause);
      expect(error.stack).not.toContain('Caused by:');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string values directly', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should extract message property from objects', () => {
      const errorObj = { message: 'Object error message' };
      expect(getErrorMessage(errorObj)).toBe('Object error message');
    });

    it('should handle null and undefined', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
    });

    it('should handle numbers and other types', () => {
      expect(getErrorMessage(123)).toBe('Unknown error occurred');
      expect(getErrorMessage(true)).toBe('Unknown error occurred');
      expect(getErrorMessage([])).toBe('Unknown error occurred');
    });

    it('should handle objects without message property', () => {
      expect(getErrorMessage({})).toBe('Unknown error occurred');
      expect(getErrorMessage({ code: 'ERROR' })).toBe('Unknown error occurred');
    });
  });

  describe('getErrorDetails', () => {
    it('should extract details from Error objects', () => {
      const error = new Error('Test error');
      error.name = 'TestError';
      
      const details = getErrorDetails(error);
      
      expect(details.message).toBe('Test error');
      expect(details.name).toBe('TestError');
      expect(details.stack).toBeDefined();
    });

    it('should extract details from ReveniumError objects', () => {
      const error = createReveniumError('Revenium error', undefined, 'REV_ERROR', 400);
      
      const details = getErrorDetails(error);
      
      expect(details.message).toBe('Revenium error');
      expect(details.name).toBe('ReveniumError');
      expect(details.code).toBe('REV_ERROR');
      expect(details.statusCode).toBe(400);
      expect(details.stack).toBeDefined();
    });

    it('should handle string errors', () => {
      const details = getErrorDetails('String error');
      
      expect(details.message).toBe('String error');
      expect(details.name).toBeUndefined();
      expect(details.code).toBeUndefined();
      expect(details.statusCode).toBeUndefined();
      expect(details.stack).toBeUndefined();
    });

    it('should handle null and undefined', () => {
      const nullDetails = getErrorDetails(null);
      expect(nullDetails.message).toBe('Unknown error occurred');
      
      const undefinedDetails = getErrorDetails(undefined);
      expect(undefinedDetails.message).toBe('Unknown error occurred');
    });

    it('should handle objects with message property', () => {
      const errorObj = { message: 'Object error', customProp: 'value' };
      const details = getErrorDetails(errorObj);
      
      expect(details.message).toBe('Object error');
      expect(details.name).toBeUndefined();
    });

    it('should handle Error objects with additional properties', () => {
      const error = new Error('Enhanced error') as any;
      error.code = 'ENHANCED_ERROR';
      error.statusCode = 422;
      error.customProperty = 'custom';
      
      const details = getErrorDetails(error);
      
      expect(details.message).toBe('Enhanced error');
      expect(details.name).toBe('Error');
      expect(details.code).toBe('ENHANCED_ERROR');
      expect(details.statusCode).toBe(422);
      expect(details.stack).toBeDefined();
      // Custom properties should not be included in details
      expect((details as any).customProperty).toBeUndefined();
    });
  });

  describe('Error chaining', () => {
    it('should properly chain errors with stack traces', () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      
      const wrappedError = createReveniumError('Wrapped error', originalError);
      
      expect(wrappedError.stack).toContain('Wrapped error');
      expect(wrappedError.stack).toContain('Caused by:');
      expect(wrappedError.stack).toContain('Original stack trace');
    });

    it('should handle multiple levels of error chaining', () => {
      const level1Error = new Error('Level 1 error');
      const level2Error = createReveniumError('Level 2 error', level1Error);
      const level3Error = createReveniumError('Level 3 error', level2Error);
      
      expect(level3Error.stack).toContain('Level 3 error');
      expect(level3Error.stack).toContain('Caused by:');
      expect(level3Error.stack).toContain('Level 2 error');
    });
  });

  describe('Error type preservation', () => {
    it('should preserve ReveniumError type through error details', () => {
      const reveniumError = createReveniumError('Test', undefined, 'TEST_CODE', 500);
      const details = getErrorDetails(reveniumError);
      
      expect(details.name).toBe('ReveniumError');
      expect(details.code).toBe('TEST_CODE');
      expect(details.statusCode).toBe(500);
    });

    it('should handle standard Error types', () => {
      const typeError = new TypeError('Type error message');
      const details = getErrorDetails(typeError);
      
      expect(details.name).toBe('TypeError');
      expect(details.message).toBe('Type error message');
      expect(details.code).toBeUndefined();
      expect(details.statusCode).toBeUndefined();
    });

    it('should handle custom Error types', () => {
      class CustomError extends Error {
        constructor(message: string, public customCode: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const customError = new CustomError('Custom error', 'CUSTOM_CODE');
      const details = getErrorDetails(customError);
      
      expect(details.name).toBe('CustomError');
      expect(details.message).toBe('Custom error');
      // Custom properties should be accessible through type casting
      expect((customError as any).customCode).toBe('CUSTOM_CODE');
    });
  });
});
