import { CreateCompletionRequest, ReveniumConfig } from "./api";

/**
 * Request batching configuration
 */
export interface BatchConfig {
    maxBatchSize: number;
    flushIntervalMs: number;
    maxWaitTimeMs: number;
  }

/**
 * Batched request item
 */
export interface BatchedRequest {
  request: CreateCompletionRequest;
  config: ReveniumConfig;
  timestamp: number;
  resolve: (value: void) => void;
  reject: (error: unknown) => void;
}