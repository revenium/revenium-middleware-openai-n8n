/**
 * Revenium service for usage tracking and API interactions
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

import type {
  CreateCompletionRequest,
  CreateCompletionResponse,
  ReveniumOpenAICredentials,
  OpenAIUsage,
  SubscriberInfo,
  ReveniumStopReason,
  OpenAIFinishReason,
} from '../../types/index.js';
import {
  hasValidId,
  hasTokenUsage,
  createReveniumError,
  getErrorDetails,
  buildSubscriberObject,
} from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import { buildReveniumUrl } from '../../utils/url-builder.js';
import {
  setConfig as setSummaryPrinterConfig,
  printUsageSummary,
} from '../../utils/summary-printer.js';

/**
 * Revenium service configuration
 */
export interface ReveniumServiceConfig {
  apiKey: string;
  baseUrl: string;
  usageMetadata?: Record<string, unknown>;
  printSummary?: boolean | 'human' | 'json';
  teamId?: string;
}

/**
 * Usage tracking options
 */
export interface UsageTrackingOptions {
  isStreamed?: boolean;
  timeToFirstToken?: number;
  systemFingerprint?: string;
  modelVersion?: string;
}

/**
 * Revenium service class for managing usage tracking
 */
export class ReveniumService {
  private config: ReveniumServiceConfig;

  constructor(config: ReveniumServiceConfig) {
    this.config = config;

    setSummaryPrinterConfig({
      reveniumApiKey: config.apiKey,
      reveniumBaseUrl: config.baseUrl,
      teamId: config.teamId,
      printSummary: config.printSummary,
    });
  }

  /**
   * Track usage with Revenium API
   */
  async trackUsage(
    messages: BaseMessage[],
    result: ChatResult,
    responseMetadata: Record<string, unknown>,
    usageMetadata: OpenAIUsage | Record<string, unknown> | undefined,
    duration: number,
    modelName: string,
    options: UsageTrackingOptions = {}
  ): Promise<CreateCompletionResponse> {
    try {
      const generation = result.generations?.[0];
      const message = generation?.message;

      // Extract usage data from multiple sources
      const usage =
        responseMetadata.usage || responseMetadata.tokenUsage || usageMetadata;
      const requestId = hasValidId(message)
        ? message.id
        : `generated-${Date.now()}`;
      const finishReason = responseMetadata.finish_reason || 'stop';

      // Debug logging for usage data extraction
      logger.debug('Usage data extraction in trackUsage: %O', {
        hasResponseMetadataUsage: !!responseMetadata.usage,
        hasResponseMetadataTokenUsage: !!responseMetadata.tokenUsage,
        hasUsageMetadata: !!usageMetadata,
        finalUsage: !!usage,
        usageStructure: usage ? Object.keys(usage) : null,
        responseMetadataKeys: Object.keys(responseMetadata),
      });

      // Check if we have any usage data at all
      if (!usage) {
        logger.warning(
          'No usage data found in any location - skipping Revenium tracking'
        );
        logger.debug(
          'Available data for debugging: responseMetadata=%O, usageMetadata=%O',
          responseMetadata,
          usageMetadata
        );
        throw new Error('No usage data available for tracking');
      }

      // Create the tracking payload
      const payload = this.createTrackingPayload(
        usage,
        requestId,
        modelName,
        finishReason as OpenAIFinishReason,
        duration,
        options
      );

      // Send to Revenium API
      const result = await this.sendTrackingData(payload);

      try {
        printUsageSummary(payload);
      } catch (summaryError) {
        logger.debug(
          'Failed to print usage summary (non-blocking): %s',
          summaryError instanceof Error
            ? summaryError.message
            : String(summaryError)
        );
      }

      return result;
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.error(
        'Failed to track usage with Revenium: %s',
        errorDetails.message
      );
      throw createReveniumError(
        'Usage tracking failed',
        error,
        'TRACKING_FAILED'
      );
    }
  }

  /**
   * Create tracking payload for Revenium API
   */
  private createTrackingPayload(
    usage: unknown,
    requestId: string,
    modelName: string,
    finishReason: OpenAIFinishReason,
    duration: number,
    options: UsageTrackingOptions
  ): CreateCompletionRequest {
    const now = new Date().toISOString();
    const requestTime = new Date(Date.now() - duration).toISOString();

    // Map OpenAI finish reason to Revenium stop reason
    const stopReason = this.mapFinishReasonToStopReason(finishReason);

    // Build subscriber object from metadata
    const subscriber = buildSubscriberObject(this.config.usageMetadata);

    // Safely extract token counts with fallbacks using type guard
    const inputTokenCount = hasTokenUsage(usage)
      ? usage.prompt_tokens || usage.promptTokens || usage.input_tokens || 0
      : 0;
    const outputTokenCount = hasTokenUsage(usage)
      ? usage.completion_tokens ||
        usage.completionTokens ||
        usage.output_tokens ||
        0
      : 0;
    const totalTokenCount = hasTokenUsage(usage)
      ? usage.total_tokens ||
        usage.totalTokens ||
        inputTokenCount + outputTokenCount ||
        0
      : 0;
    const reasoningTokenCount = hasTokenUsage(usage)
      ? usage.completion_tokens_details?.reasoning_tokens ||
        usage.output_token_details?.reasoning ||
        0
      : 0;
    const cacheReadTokenCount = hasTokenUsage(usage)
      ? usage.prompt_tokens_details?.cached_tokens ||
        usage.input_token_details?.cache_read ||
        0
      : 0;

    return {
      stopReason,
      costType: 'AI',
      isStreamed: options.isStreamed || false,
      operationType: 'CHAT',
      inputTokenCount,
      outputTokenCount,
      reasoningTokenCount,
      cacheCreationTokenCount: 0, // Not provided by OpenAI
      cacheReadTokenCount,
      totalTokenCount,
      model: modelName,
      transactionId: requestId,
      responseTime: now,
      requestDuration: Math.round(duration),
      provider: 'OPENAI',
      requestTime: requestTime,
      completionStartTime: now,
      timeToFirstToken: options.timeToFirstToken || Math.round(duration),
      // Enhanced metadata
      systemFingerprint: options.systemFingerprint,
      modelVersion: options.modelVersion || modelName,
      // Additional OpenAI-specific token details
      audioInputTokens: hasTokenUsage(usage)
        ? usage.prompt_tokens_details?.audio_tokens ||
          usage.input_token_details?.audio ||
          0
        : 0,
      audioOutputTokens: hasTokenUsage(usage)
        ? usage.completion_tokens_details?.audio_tokens ||
          usage.output_token_details?.audio ||
          0
        : 0,
      acceptedPredictionTokens: hasTokenUsage(usage)
        ? usage.completion_tokens_details?.accepted_prediction_tokens || 0
        : 0,
      rejectedPredictionTokens: hasTokenUsage(usage)
        ? usage.completion_tokens_details?.rejected_prediction_tokens || 0
        : 0,
      // NEW nested subscriber structure and middleware source
      subscriber,
      middlewareSource: 'n8n', // Required field for source identification (camelCase per API spec)
      // User-defined metadata (only include if values are provided)
      ...(this.config.usageMetadata?.traceId && {
        traceId: this.config.usageMetadata.traceId,
      }),
      ...(this.config.usageMetadata?.taskType && {
        taskType: this.config.usageMetadata.taskType,
      }),
      ...(this.config.usageMetadata?.agent && {
        agent: this.config.usageMetadata.agent,
      }),
      ...(this.config.usageMetadata?.organizationId && {
        organizationId: this.config.usageMetadata.organizationId,
      }),
      ...(this.config.usageMetadata?.productId && {
        productId: this.config.usageMetadata.productId,
      }),
      ...(this.config.usageMetadata?.subscriptionId && {
        subscriptionId: this.config.usageMetadata.subscriptionId,
      }),
      ...(this.config.usageMetadata?.responseQualityScore && {
        responseQualityScore: this.config.usageMetadata.responseQualityScore,
      }),
    };
  }

  /**
   * Send tracking data to Revenium API
   */
  private async sendTrackingData(
    payload: CreateCompletionRequest
  ): Promise<CreateCompletionResponse> {
    const url = buildReveniumUrl(this.config.baseUrl, '/ai/completions');

    // Log tracking info without sensitive data
    logger.debug(
      'Sending Revenium tracking payload: requestId=%s, model=%s, tokens=%d, duration=%d, stopReason=%s, isStreamed=%s',
      payload.transactionId,
      payload.model,
      payload.totalTokenCount,
      payload.requestDuration,
      payload.stopReason,
      payload.isStreamed
    );

    // Debug credentials and URL construction
    logger.debug(
      'Revenium API call details: url=%s, apiKeyPrefix=%s, baseUrl=%s',
      url,
      this.config.apiKey
        ? this.config.apiKey.substring(0, 8) + '...'
        : 'MISSING',
      this.config.baseUrl
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': this.config.apiKey, // Revenium expects lowercase
        'User-Agent': 'n8n-revenium-middleware/1.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw createReveniumError(
        `Revenium API error: ${response.status} ${response.statusText} - ${errorText}`,
        undefined,
        'API_ERROR',
        response.status
      );
    }

    const result = (await response.json()) as CreateCompletionResponse;
    logger.debug('Revenium tracking successful: responseId=%s', result.id);

    return result;
  }

  /**
   * Map OpenAI finish reason to Revenium stop reason
   */
  private mapFinishReasonToStopReason(
    finishReason: OpenAIFinishReason
  ): ReveniumStopReason {
    switch (finishReason) {
      case 'stop':
        return 'END';
      case 'length':
        return 'TOKEN_LIMIT';
      case 'function_call':
      case 'tool_calls':
        return 'END_SEQUENCE';
      case 'content_filter':
        return 'ERROR';
      case 'timeout':
        return 'TIMEOUT';
      default:
        return 'END';
    }
  }

  /**
   * Create service instance from credentials
   */
  static fromCredentials(
    credentials: ReveniumOpenAICredentials
  ): ReveniumService {
    return new ReveniumService({
      apiKey: credentials.reveniumApiKey,
      baseUrl: credentials.reveniumBaseUrl,
      usageMetadata: credentials.usageMetadata,
      printSummary: credentials.printSummary,
      teamId: credentials.teamId,
    });
  }
}
