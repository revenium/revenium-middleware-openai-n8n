import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult, ChatGenerationChunk } from '@langchain/core/outputs';
import { ChatOpenAI, type ChatOpenAICallOptions } from '@langchain/openai';
import {
  type INodeType,
  type INodeTypeDescription,
  type ISupplyDataFunctions,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  type SupplyData,
  NodeConnectionTypes,
  NodeOperationError,
} from 'n8n-workflow';

// Import the correct LangChain interface for Chat Models

// Import OpenAI client for model listing
import OpenAI from 'openai';

// Import our enhanced types
import type {
  ReveniumOpenAICredentials,
  OpenAIUsage,
  N8nNodeOptions,
  UsageMetadata,
  SubscriberInfo,
} from '../../src/types/index.js';

// Import error handling utilities
import {
  validateCredentials,
  createReveniumError,
  getErrorDetails,
  getTimeoutConfig,
  validateSecureUrl,
  validateModelName,
  validateTimeout,
  validateNumericParameter,
  hasValidId,
  hasUsageMetadata,
  hasCreatedProperty,
  hasTokenUsage,
  extractPrompts,
  shouldCapturePrompts,
  getMaxPromptSize,
} from '../../src/utils/index.js';
import { logger } from '../../src/utils/logger.js';
import { buildReveniumUrl } from '../../src/utils/url-builder.js';

function isReasoningModel(modelName: string): boolean {
  if (modelName.startsWith('gpt-5-chat')) {
    return false;
  }

  const reasoningModels = [
    'o1-mini',
    'o1-preview',
    'o1',
    'o3-mini',
    'o3',
    'o4-mini',
    'o4',
    'gpt-5.1-codex',
    'gpt-5.1',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-5',
  ];
  return reasoningModels.some(model => modelName.startsWith(model));
}

class ReveniumTrackedChatOpenAI extends ChatOpenAI {
  private reveniumCredentials: ReveniumOpenAICredentials;

  constructor(
    config: Record<string, unknown>,
    reveniumCredentials: ReveniumOpenAICredentials
  ) {
    super(config);
    this.reveniumCredentials = reveniumCredentials;
  }

  /**
   * Extract generation data from chat result
   */
  private extractGenerationData(result: ChatResult): {
    generation: unknown;
    message: unknown;
    responseMetadata: Record<string, unknown> | undefined;
  } {
    const generation = result?.generations?.[0];
    const message = generation?.message;
    const responseMetadata = generation?.message?.response_metadata;

    return { generation, message, responseMetadata };
  }

  /**
   * Log debug information about result structure
   */
  private logResultStructure(
    result: ChatResult,
    generation: unknown,
    message: unknown,
    responseMetadata: Record<string, unknown> | undefined
  ): void {
    logger.debug('Revenium tracking - full result structure: %O', {
      hasResult: !!result,
      hasGenerations: !!result?.generations,
      generationsLength: result?.generations?.length,
      hasGeneration: !!generation,
      hasMessage: !!message,
      hasResponseMetadata: !!responseMetadata,
      responseMetadataKeys: responseMetadata
        ? Object.keys(responseMetadata)
        : [],
      hasUsageInResponseMetadata: !!responseMetadata?.usage,
      hasUsageMetadataInMessage: hasUsageMetadata(message),
      messageKeys: message ? Object.keys(message) : [],
      messageId: (message as { id?: string })?.id,
    });

    // Log the actual response metadata structure for debugging
    if (responseMetadata) {
      logger.debug('Response metadata structure: %O', responseMetadata);
    }
  }

  /**
   * Find usage data from multiple possible locations
   */
  private findUsageData(
    responseMetadata: Record<string, unknown> | undefined,
    message: unknown,
    generation: unknown
  ): unknown {
    const usageFromResponseMetadata = responseMetadata?.usage;
    const usageFromMessage = hasUsageMetadata(message)
      ? (message as { usage_metadata: unknown }).usage_metadata
      : undefined;
    const usageFromGeneration = hasUsageMetadata(generation)
      ? (generation as { usage_metadata: unknown }).usage_metadata
      : undefined;

    logger.debug('Usage data locations: %O', {
      usageFromResponseMetadata: !!usageFromResponseMetadata,
      usageFromMessage: !!usageFromMessage,
      usageFromGeneration: !!usageFromGeneration,
      usageFromResponseMetadataStructure: usageFromResponseMetadata
        ? Object.keys(usageFromResponseMetadata)
        : null,
      usageFromMessageStructure: usageFromMessage
        ? Object.keys(usageFromMessage)
        : null,
      usageFromGenerationStructure: usageFromGeneration
        ? Object.keys(usageFromGeneration)
        : null,
    });

    return usageFromResponseMetadata || usageFromMessage || usageFromGeneration;
  }

  /**
   * Track usage with error handling
   */
  private async trackUsageWithErrorHandling(
    messages: BaseMessage[],
    result: ChatResult,
    responseMetadata: Record<string, unknown>,
    usageMetadata: unknown,
    duration: number,
    options?: ChatOpenAICallOptions
  ): Promise<void> {
    try {
      await this.trackUsageWithRevenium(
        messages,
        result,
        responseMetadata,
        usageMetadata as Record<string, unknown> | undefined,
        duration,
        false,
        undefined,
        options
      );
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);
      logger.warning('Revenium tracking failed: %s', errorDetails.message);
    }
  }

  async _generate(
    messages: BaseMessage[],
    options: ChatOpenAICallOptions,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const startTime = Date.now();

    // Call the original _generate method
    const result = await super._generate(messages, options, runManager);

    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info('Revenium Chat Model - intercepting _generate call');

    // Extract metadata for Revenium tracking
    try {
      const { generation, message, responseMetadata } =
        this.extractGenerationData(result);

      logger.info(
        'OpenAI API call successful, extracting metadata for Revenium...'
      );

      // Enhanced debug logging to understand the response structure
      this.logResultStructure(result, generation, message, responseMetadata);

      if (responseMetadata) {
        // Try to find usage data from any available location
        const usageMetadata = this.findUsageData(
          responseMetadata,
          message,
          generation
        );

        // Fire-and-forget Revenium tracking with comprehensive metadata
        this.trackUsageWithErrorHandling(
          messages,
          result,
          responseMetadata,
          usageMetadata,
          duration,
          options
        );
      } else {
        logger.warning('No response metadata found for Revenium tracking');
      }
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);
      logger.warning(
        'Error extracting metadata for Revenium tracking: %s',
        errorDetails.message
      );
    }

    return result;
  }

  /**
   * Setup stream timeout and abort controller
   */
  private setupStreamTimeout(options: ChatOpenAICallOptions): {
    abortController: AbortController;
    timeoutId: NodeJS.Timeout;
    streamTimeout: number;
  } {
    const abortController = new AbortController();
    const timeouts = getTimeoutConfig();
    const streamTimeout = (options.timeout as number) || timeouts.streamTimeout;
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, streamTimeout);

    return { abortController, timeoutId, streamTimeout };
  }

  /**
   * Check if chunk contains first token
   */
  private isFirstTokenChunk(chunk: unknown): boolean {
    return !!(
      chunk &&
      typeof chunk === 'object' &&
      'text' in chunk &&
      typeof (chunk as { text?: unknown }).text === 'string' &&
      (chunk as { text: string }).text
    );
  }

  /**
   * Extract response metadata from chunk
   */
  private extractResponseMetadata(
    chunk: unknown
  ): Record<string, unknown> | null {
    if (
      chunk &&
      typeof chunk === 'object' &&
      'generationInfo' in chunk &&
      chunk.generationInfo &&
      typeof chunk.generationInfo === 'object' &&
      'response_metadata' in chunk.generationInfo
    ) {
      return chunk.generationInfo.response_metadata as Record<string, unknown>;
    }
    return null;
  }

  /**
   * Extract usage metadata from chunk
   */
  private extractUsageMetadata(chunk: unknown): OpenAIUsage | null {
    if (
      chunk &&
      typeof chunk === 'object' &&
      'generationInfo' in chunk &&
      chunk.generationInfo &&
      typeof chunk.generationInfo === 'object' &&
      'usage_metadata' in chunk.generationInfo
    ) {
      return chunk.generationInfo.usage_metadata as OpenAIUsage;
    }
    return null;
  }

  /**
   * Process streaming chunk and update tracking data
   */
  private processStreamingChunk(
    chunk: ChatGenerationChunk,
    startTime: number,
    firstTokenTime: number | null,
    lastResponseMetadata: Record<string, unknown> | null,
    accumulatedUsage: OpenAIUsage | null
  ): {
    updatedFirstTokenTime: number | null;
    updatedResponseMetadata: Record<string, unknown> | null;
    updatedUsage: OpenAIUsage | null;
  } {
    let updatedFirstTokenTime = firstTokenTime;
    let updatedResponseMetadata = lastResponseMetadata;
    let updatedUsage = accumulatedUsage;

    // Record first token time
    if (!updatedFirstTokenTime && this.isFirstTokenChunk(chunk)) {
      updatedFirstTokenTime = Date.now();
      logger.debug(
        'First token received in streaming at: %d ms',
        updatedFirstTokenTime - startTime
      );
    }

    // Extract metadata from streaming chunks
    const responseMetadata = this.extractResponseMetadata(chunk);
    if (responseMetadata) {
      updatedResponseMetadata = responseMetadata;
    }

    // Look for usage data
    const usageMetadata = this.extractUsageMetadata(chunk);
    if (usageMetadata) {
      updatedUsage = usageMetadata;
    }

    return {
      updatedFirstTokenTime,
      updatedResponseMetadata,
      updatedUsage,
    };
  }

  /**
   * Track streaming usage after completion
   */
  private async trackStreamingUsage(
    messages: BaseMessage[],
    lastResponseMetadata: Record<string, unknown> | null,
    accumulatedUsage: OpenAIUsage | null,
    startTime: number,
    firstTokenTime: number | null,
    chunkCount: number,
    accumulatedContent: string,
    options?: ChatOpenAICallOptions
  ): Promise<void> {
    if (!lastResponseMetadata || !this.reveniumCredentials) {
      logger.warning('Streaming Revenium tracking skipped - no metadata found');
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const timeToFirstToken = firstTokenTime
      ? firstTokenTime - startTime
      : duration;

    logger.debug(
      'Streaming Revenium tracking - final metadata extraction: hasResponseMetadata=%s, hasUsageMetadata=%s, duration=%d, timeToFirstToken=%d, chunkCount=%d',
      !!lastResponseMetadata,
      !!accumulatedUsage,
      duration,
      timeToFirstToken,
      chunkCount
    );

    // Fire-and-forget streaming tracking with proper error handling
    const fakeResult: ChatResult = {
      generations: [
        {
          text: accumulatedContent,
          message: {
            content: accumulatedContent,
            response_metadata: lastResponseMetadata,
            usage_metadata: accumulatedUsage,
          } as unknown as BaseMessage,
        },
      ],
    };

    try {
      await this.trackUsageWithRevenium(
        messages,
        fakeResult,
        lastResponseMetadata,
        accumulatedUsage || {},
        duration,
        true, // isStreamed
        timeToFirstToken,
        options
      );
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.warning(
        'Streaming Revenium tracking failed (non-blocking): %s',
        errorDetails.message
      );
      // Log additional context in development
      if (process.env.NODE_ENV === 'development') {
        logger.debug(
          'Streaming tracking error context: chunkCount=%d, duration=%d, hasMetadata=%s',
          chunkCount,
          duration,
          !!lastResponseMetadata
        );
      }
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: ChatOpenAICallOptions,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk, void, unknown> {
    logger.info(
      'Revenium Chat Model - intercepting streaming _streamResponseChunks call'
    );

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let accumulatedUsage: OpenAIUsage | null = null;
    let lastResponseMetadata: Record<string, unknown> | null = null;
    let accumulatedContent = '';

    // Pre-compute prompt capture settings (avoid repeated calls in loop)
    const captureEnabled = shouldCapturePrompts(
      this.reveniumCredentials.usageMetadata
    );
    const maxPromptSize = captureEnabled
      ? getMaxPromptSize(this.reveniumCredentials.usageMetadata)
      : 0;

    // Setup timeout and abort controller
    const { abortController, timeoutId, streamTimeout } =
      this.setupStreamTimeout(options);
    const { signal } = abortController;

    try {
      // Call the original streaming method with abort signal
      const streamGenerator = super._streamResponseChunks(
        messages,
        options,
        runManager
      );

      let chunkCount = 0;
      let lastChunkTime = Date.now();

      for await (const chunk of streamGenerator) {
        // Check if stream was aborted
        if (signal.aborted) {
          throw createReveniumError(
            'Stream aborted',
            undefined,
            'STREAM_ABORTED'
          );
        }

        // Check for stream timeout
        const currentTime = Date.now();
        if (currentTime - lastChunkTime > streamTimeout) {
          abortController.abort();
          throw createReveniumError(
            'Stream timeout exceeded',
            undefined,
            'STREAM_TIMEOUT'
          );
        }
        lastChunkTime = currentTime;

        chunkCount++;

        // Process chunk and update tracking data
        const { updatedFirstTokenTime, updatedResponseMetadata, updatedUsage } =
          this.processStreamingChunk(
            chunk,
            startTime,
            firstTokenTime,
            lastResponseMetadata,
            accumulatedUsage
          );

        firstTokenTime = updatedFirstTokenTime;
        lastResponseMetadata = updatedResponseMetadata;
        accumulatedUsage = updatedUsage;

        // Accumulate content for prompt capture
        if (chunk.text && captureEnabled) {
          const remaining = maxPromptSize - accumulatedContent.length;
          if (remaining > 0) {
            accumulatedContent += chunk.text.slice(0, remaining);
          }
        }

        // Yield the chunk unchanged
        yield chunk;
      }

      logger.info(`Streaming completed: ${chunkCount} chunks processed`);

      // Track usage after streaming is complete
      await this.trackStreamingUsage(
        messages,
        lastResponseMetadata,
        accumulatedUsage,
        startTime,
        firstTokenTime,
        chunkCount,
        accumulatedContent,
        options
      );
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.error(
        'Revenium Chat Model - streaming error: %s',
        errorDetails.message
      );
      // Re-throw with proper error context
      if (error instanceof Error && error.name === 'ReveniumError') {
        throw error;
      }
      throw createReveniumError(
        `Streaming failed: ${errorDetails.message}`,
        error,
        'STREAMING_ERROR'
      );
    } finally {
      // Cleanup resources
      clearTimeout(timeoutId);
      if (!signal.aborted) {
        abortController.abort();
      }
    }
  }

  /**
   * Get field value with camelCase and snake_case fallback
   */
  private getFieldValue(
    camelCase: string | undefined,
    snakeCase: string | undefined
  ): string | undefined {
    return camelCase || snakeCase;
  }

  /**
   * Extract subscriber fields with camelCase and snake_case support
   */
  private extractSubscriberFields(usageMetadata: UsageMetadata): {
    id: string | undefined;
    email: string | undefined;
    credentialName: string | undefined;
    credentialValue: string | undefined;
  } {
    return {
      id: this.getFieldValue(
        usageMetadata.subscriberId,
        usageMetadata.subscriber_id
      ),
      email: this.getFieldValue(
        usageMetadata.subscriberEmail,
        usageMetadata.subscriber_email
      ),
      credentialName: this.getFieldValue(
        usageMetadata.subscriberCredentialName,
        usageMetadata.subscriber_credential_name
      ),
      credentialValue: this.getFieldValue(
        usageMetadata.subscriberCredential,
        usageMetadata.subscriber_credential
      ),
    };
  }

  /**
   * Check if any subscriber data is provided
   */
  private hasSubscriberData(
    id: string | undefined,
    email: string | undefined,
    credentialName: string | undefined,
    credentialValue: string | undefined
  ): boolean {
    const fields = [id, email, credentialName, credentialValue];
    return fields.some(field => !!field);
  }

  /**
   * Build credential object if both name and value are present
   */
  private buildCredentialObject(
    credentialName: string | undefined,
    credentialValue: string | undefined
  ): { name: string; value: string } | undefined {
    if (credentialName && credentialValue) {
      return {
        name: credentialName,
        value: credentialValue,
      };
    }
    return undefined;
  }

  /**
   * Build subscriber info object from extracted fields
   */
  private buildSubscriberInfo(
    id: string | undefined,
    email: string | undefined,
    credentialName: string | undefined,
    credentialValue: string | undefined
  ): SubscriberInfo {
    const subscriber: SubscriberInfo = {};

    if (id) subscriber.id = id;
    if (email) subscriber.email = email;

    // Only add credential if both name and value are present
    const credential = this.buildCredentialObject(
      credentialName,
      credentialValue
    );
    if (credential) {
      subscriber.credential = credential;
    }

    return subscriber;
  }

  /**
   * Build nested subscriber object from flat metadata
   * Supports both camelCase and snake_case field names
   */
  private buildSubscriberObject(
    usageMetadata?: UsageMetadata
  ): SubscriberInfo | undefined {
    if (!usageMetadata) {
      return undefined;
    }

    const { id, email, credentialName, credentialValue } =
      this.extractSubscriberFields(usageMetadata);

    // Return undefined if no subscriber data provided
    if (!this.hasSubscriberData(id, email, credentialName, credentialValue)) {
      return undefined;
    }

    return this.buildSubscriberInfo(id, email, credentialName, credentialValue);
  }

  /**
   * Extract basic tracking data from response
   */
  private extractTrackingData(
    result: ChatResult,
    responseMetadata: Record<string, unknown>,
    usageMetadata: OpenAIUsage | Record<string, unknown> | undefined
  ): {
    usage: unknown;
    requestId: string;
    modelName: string;
    finishReason: string;
  } | null {
    const generation = result.generations?.[0];
    const message = generation?.message;

    // Extract usage data from multiple sources (OpenAI provides redundant data)
    const usage =
      responseMetadata.usage || responseMetadata.tokenUsage || usageMetadata;
    const requestId = hasValidId(message)
      ? message.id
      : `generated-${Date.now()}`;
    const modelName = (responseMetadata.model_name as string) || this.model;
    const finishReason = (responseMetadata.finish_reason as string) || 'stop';

    // Debug logging for usage data extraction
    logger.debug('Usage data extraction in trackUsageWithRevenium: %O', {
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
      return null;
    }

    return { usage, requestId, modelName, finishReason };
  }

  /**
   * Map OpenAI finish reason to Revenium stop reason
   */
  private mapFinishReasonToStopReason(finishReason: string): string {
    switch (finishReason) {
      case 'stop':
        return 'END';
      case 'length':
        return 'MAX_TOKENS';
      case 'content_filter':
        return 'CONTENT_FILTER';
      case 'tool_calls':
        return 'TOOL_CALLS';
      default:
        return 'END';
    }
  }

  /**
   * Extract basic token counts (input, output, total)
   */
  private extractBasicTokenCounts(usage: unknown): {
    inputTokenCount: number;
    outputTokenCount: number;
    totalTokenCount: number;
  } {
    if (!hasTokenUsage(usage)) {
      return { inputTokenCount: 0, outputTokenCount: 0, totalTokenCount: 0 };
    }

    const inputTokenCount =
      usage.prompt_tokens || usage.promptTokens || usage.input_tokens || 0;
    const outputTokenCount =
      usage.completion_tokens ||
      usage.completionTokens ||
      usage.output_tokens ||
      0;
    const totalTokenCount =
      usage.total_tokens ||
      usage.totalTokens ||
      inputTokenCount + outputTokenCount ||
      0;

    return { inputTokenCount, outputTokenCount, totalTokenCount };
  }

  /**
   * Extract advanced token counts (reasoning, cache)
   */
  private extractAdvancedTokenCounts(usage: unknown): {
    reasoningTokenCount: number;
    cacheReadTokenCount: number;
  } {
    if (!hasTokenUsage(usage)) {
      return { reasoningTokenCount: 0, cacheReadTokenCount: 0 };
    }

    const reasoningTokenCount =
      usage.completion_tokens_details?.reasoning_tokens ||
      usage.output_token_details?.reasoning ||
      0;
    const cacheReadTokenCount =
      usage.prompt_tokens_details?.cached_tokens ||
      usage.input_token_details?.cache_read ||
      0;

    return { reasoningTokenCount, cacheReadTokenCount };
  }

  /**
   * Extract audio token counts
   */
  private extractAudioTokenCounts(usage: unknown): {
    audioInputTokens: number;
    audioOutputTokens: number;
  } {
    if (!hasTokenUsage(usage)) {
      return { audioInputTokens: 0, audioOutputTokens: 0 };
    }

    const audioInputTokens =
      usage.prompt_tokens_details?.audio_tokens ||
      usage.input_token_details?.audio ||
      0;
    const audioOutputTokens =
      usage.completion_tokens_details?.audio_tokens ||
      usage.output_token_details?.audio ||
      0;

    return { audioInputTokens, audioOutputTokens };
  }

  /**
   * Extract prediction token counts
   */
  private extractPredictionTokenCounts(usage: unknown): {
    acceptedPredictionTokens: number;
    rejectedPredictionTokens: number;
  } {
    if (!hasTokenUsage(usage)) {
      return { acceptedPredictionTokens: 0, rejectedPredictionTokens: 0 };
    }

    const acceptedPredictionTokens =
      usage.completion_tokens_details?.accepted_prediction_tokens || 0;
    const rejectedPredictionTokens =
      usage.completion_tokens_details?.rejected_prediction_tokens || 0;

    return { acceptedPredictionTokens, rejectedPredictionTokens };
  }

  /**
   * Extract token counts from usage data with fallbacks
   */
  private extractTokenCounts(usage: unknown): {
    inputTokenCount: number;
    outputTokenCount: number;
    totalTokenCount: number;
    reasoningTokenCount: number;
    cacheReadTokenCount: number;
    audioInputTokens: number;
    audioOutputTokens: number;
    acceptedPredictionTokens: number;
    rejectedPredictionTokens: number;
  } {
    const basicCounts = this.extractBasicTokenCounts(usage);
    const advancedCounts = this.extractAdvancedTokenCounts(usage);
    const audioCounts = this.extractAudioTokenCounts(usage);
    const predictionCounts = this.extractPredictionTokenCounts(usage);

    logger.debug(
      'Extracted token counts: input=%d, output=%d, total=%d, reasoning=%d, cached=%d',
      basicCounts.inputTokenCount,
      basicCounts.outputTokenCount,
      basicCounts.totalTokenCount,
      advancedCounts.reasoningTokenCount,
      advancedCounts.cacheReadTokenCount
    );

    return {
      ...basicCounts,
      ...advancedCounts,
      ...audioCounts,
      ...predictionCounts,
    };
  }

  /**
   * Build user-defined metadata object
   */
  private buildUserMetadata(): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (this.reveniumCredentials.usageMetadata?.traceId) {
      metadata.traceId = this.reveniumCredentials.usageMetadata.traceId;
    }
    if (this.reveniumCredentials.usageMetadata?.taskType) {
      metadata.taskType = this.reveniumCredentials.usageMetadata.taskType;
    }
    if (this.reveniumCredentials.usageMetadata?.organizationId) {
      metadata.organizationId =
        this.reveniumCredentials.usageMetadata.organizationId;
    }
    if (this.reveniumCredentials.usageMetadata?.subscriptionId) {
      metadata.subscriptionId =
        this.reveniumCredentials.usageMetadata.subscriptionId;
    }
    if (this.reveniumCredentials.usageMetadata?.productId) {
      metadata.productId = this.reveniumCredentials.usageMetadata.productId;
    }
    if (this.reveniumCredentials.usageMetadata?.agent) {
      metadata.agent = this.reveniumCredentials.usageMetadata.agent;
    }
    if (this.reveniumCredentials.usageMetadata?.responseQualityScore) {
      metadata.responseQualityScore =
        this.reveniumCredentials.usageMetadata.responseQualityScore;
    }

    return metadata;
  }

  /**
   * Send tracking data to Revenium API
   */
  private async sendToReveniumAPI(
    payload: Record<string, unknown>
  ): Promise<void> {
    const reveniumUrl = buildReveniumUrl(
      this.reveniumCredentials.reveniumBaseUrl,
      '/ai/completions'
    );
    logger.debug(
      'Revenium API call details: url=%s, apiKeyPrefix=%s, baseUrl=%s',
      reveniumUrl,
      this.reveniumCredentials.reveniumApiKey
        ? this.reveniumCredentials.reveniumApiKey.substring(0, 8) + '...'
        : 'MISSING',
      this.reveniumCredentials.reveniumBaseUrl
    );

    const response = await fetch(reveniumUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': this.reveniumCredentials.reveniumApiKey, // Revenium expects lowercase
        'User-Agent': 'n8n-revenium-middleware/1.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error(
        'Revenium API error: status=%d, statusText=%s, body=%s',
        response.status,
        response.statusText,
        responseText
      );
      throw new Error(
        `Revenium API error: ${response.status} ${response.statusText} - ${responseText}`
      );
    }

    const responseBody = await response.text();
    logger.info(
      'Revenium tracking successful: requestId=%s, tokens=%d, response=%s',
      payload.transactionId,
      payload.totalTokenCount,
      responseBody
    );
  }

  private async trackUsageWithRevenium(
    _messages: BaseMessage[],
    result: ChatResult,
    responseMetadata: Record<string, unknown>,
    usageMetadata: OpenAIUsage | Record<string, unknown> | undefined,
    duration: number,
    isStreamed: boolean = false,
    timeToFirstToken?: number,
    options?: ChatOpenAICallOptions
  ): Promise<void> {
    try {
      // Extract basic tracking data
      const trackingData = this.extractTrackingData(
        result,
        responseMetadata,
        usageMetadata
      );
      if (!trackingData) {
        return; // No usage data available
      }

      const { usage, requestId, modelName, finishReason } = trackingData;

      // Map finish reason to stop reason
      const stopReason = this.mapFinishReasonToStopReason(finishReason);

      // Extract token counts
      const tokenCounts = this.extractTokenCounts(usage);

      // Build subscriber object from metadata
      const subscriber = this.buildSubscriberObject(
        this.reveniumCredentials.usageMetadata
      );
      if (subscriber) {
        logger.debug('Built subscriber object: %O', subscriber);
      } else {
        logger.debug('No subscriber metadata provided');
      }

      // Build timestamps
      const now = new Date().toISOString();
      const requestTime = new Date(Date.now() - duration).toISOString();

      // Build user metadata
      const userMetadata = this.buildUserMetadata();

      // Extract response_format from options
      const attributes: Record<string, unknown> = {};
      if (options) {
        const responseFormat = (options as any).response_format;
        if (responseFormat) {
          if (typeof responseFormat === 'object' && responseFormat !== null) {
            const formatType = responseFormat.type;
            if (formatType) {
              attributes.response_format_type = formatType;
              if (formatType === 'json_schema') {
                const schemaName = responseFormat.json_schema?.name;
                if (schemaName) {
                  attributes.response_format_schema_name = schemaName;
                }
              }
            }
          } else {
            attributes.response_format = responseFormat;
          }
        }
      }

      // Extract prompts if capture is enabled
      const promptData = extractPrompts(
        _messages,
        result,
        this.reveniumCredentials.usageMetadata
      );

      // Build Revenium payload
      const reveniumPayload = {
        stopReason,
        costType: 'AI',
        isStreamed: isStreamed,
        operationType: 'CHAT',
        ...tokenCounts,
        cacheCreationTokenCount: 0, // Not provided by OpenAI
        model: modelName,
        transactionId: requestId,
        responseTime: now,
        requestDuration: Math.round(duration),
        provider: 'OpenAI',
        requestTime: requestTime,
        completionStartTime: now,
        timeToFirstToken: timeToFirstToken || Math.round(duration),
        // Enhanced metadata
        systemFingerprint: responseMetadata.system_fingerprint,
        modelVersion: modelName,
        // NEW nested subscriber structure and middleware source
        subscriber,
        middlewareSource: 'n8n', // Required field for source identification (camelCase per API spec)
        // User-defined metadata
        ...userMetadata,
        ...(Object.keys(attributes).length > 0 && { attributes }),
        // Prompt capture fields
        ...(promptData && {
          systemPrompt: promptData.systemPrompt,
          inputMessages: promptData.inputMessages,
          outputResponse: promptData.outputResponse,
          promptsTruncated: promptData.promptsTruncated,
        }),
      };

      // Log tracking info without sensitive data
      logger.debug(
        'Sending Revenium tracking payload: requestId=%s, model=%s, tokens=%d, duration=%d, stopReason=%s, isStreamed=%s',
        requestId,
        modelName,
        reveniumPayload.totalTokenCount,
        reveniumPayload.requestDuration,
        reveniumPayload.stopReason,
        reveniumPayload.isStreamed
      );

      // Send to Revenium API
      await this.sendToReveniumAPI(reveniumPayload);
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.warning('Revenium tracking failed: %s', errorDetails.message);
      // Log full error details in debug mode for troubleshooting
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Full Revenium tracking error details: %O', errorDetails);
      }
      // Don't throw - tracking should not break the main flow
    }
  }
}

export class ReveniumOpenAIChatModel implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Revenium OpenAI Chat Model',
    name: 'reveniumOpenAIChatModel',
    icon: 'file:ReveniumOpenAI.png',
    group: ['transform'],
    version: 1,
    description: 'Chat Model with automatic Revenium usage tracking',
    defaults: {
      name: 'Revenium OpenAI Chat Model',
    },
    // Language Models use a different categorization system
    codex: {
      categories: ['Langchain'],
      subcategories: {
        Langchain: ['Chat Models'],
      },
      resources: {
        primaryDocumentation: [
          {
            url: 'https://docs.revenium.io',
          },
        ],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiLanguageModel],
    outputNames: ['Model'],
    credentials: [
      {
        name: 'reveniumOpenAI',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'From List',
            value: 'fromList',
          },
          {
            name: 'By ID',
            value: 'byId',
          },
        ],
        default: 'fromList',
        description: 'Select how to specify the model',
      },
      {
        displayName: 'Model',
        name: 'modelId',
        type: 'options',
        noDataExpression: true,
        description:
          'The model which will generate the completion. Models are loaded dynamically from OpenAI.',
        typeOptions: {
          loadOptionsMethod: 'getModels',
        },
        default: 'gpt-4o-mini',
        displayOptions: {
          show: {
            model: ['fromList'],
          },
        },
      },
      {
        displayName: 'Model ID',
        name: 'modelId',
        type: 'string',
        default: 'gpt-4o-mini',
        placeholder: 'gpt-4o-mini',
        description: 'Custom model ID to use',
        displayOptions: {
          show: {
            model: ['byId'],
          },
        },
      },
      {
        displayName: 'Options',
        name: 'options',
        placeholder: 'Add Option',
        description: 'Additional options to configure',
        type: 'collection',
        default: {},
        options: [
          {
            displayName: 'Base URL',
            name: 'baseURL',
            default: '',
            description: 'Override the default base URL for the API',
            type: 'string',
          },
          {
            displayName: 'Frequency Penalty',
            name: 'frequencyPenalty',
            default: 0,
            typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
            description:
              'Positive values penalize new tokens based on their existing frequency in the text so far',
            type: 'number',
          },
          {
            displayName: 'Maximum Number of Tokens',
            name: 'maxTokens',
            default: -1,
            description:
              'The maximum number of tokens to generate in the completion',
            type: 'number',
            typeOptions: {
              minValue: -1,
            },
          },
          {
            displayName: 'Presence Penalty',
            name: 'presencePenalty',
            default: 0,
            typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
            description:
              'Positive values penalize new tokens based on whether they appear in the text so far',
            type: 'number',
          },
          {
            displayName: 'Sampling Temperature',
            name: 'temperature',
            default: 0.7,
            typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
            description:
              'Controls randomness: Lowering results in less random completions',
            type: 'number',
          },
          {
            displayName: 'Timeout',
            name: 'timeout',
            default: 60000,
            description:
              'Maximum amount of time a request is allowed to take in milliseconds',
            type: 'number',
          },
          {
            displayName: 'Max Retries',
            name: 'maxRetries',
            default: 2,
            description: 'Maximum number of retries for a request',
            type: 'number',
          },
          {
            displayName: 'Top P',
            name: 'topP',
            default: 1,
            typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
            description:
              'Total probability mass of tokens to consider at each step',
            type: 'number',
          },
        ],
      },
      {
        displayName: 'Usage Metadata',
        name: 'usageMetadata',
        type: 'collection',
        placeholder: 'Add Metadata',
        default: {},
        description:
          'Optional metadata for enhanced Revenium tracking and analytics',
        options: [
          {
            displayName: 'Trace ID',
            name: 'traceId',
            type: 'string',
            default: '',
            description: 'Unique identifier for a conversation or session',
          },
          {
            displayName: 'Task Type',
            name: 'taskType',
            type: 'string',
            default: '',
            description: 'Classification of the AI operation by type of work',
          },
          {
            displayName: 'Subscriber Email',
            name: 'subscriberEmail',
            type: 'string',
            default: '',
            description: 'The email address of the subscriber',
          },
          {
            displayName: 'Subscriber ID',
            name: 'subscriberId',
            type: 'string',
            default: '',
            description: 'The ID of the subscriber from non-Revenium systems',
          },
          {
            displayName: 'Subscriber Credential Name',
            name: 'subscriberCredentialName',
            type: 'string',
            default: '',
            description: 'Name of the credential used by the subscriber',
          },
          {
            displayName: 'Subscriber Credential',
            name: 'subscriberCredential',
            type: 'string',
            default: '',
            description: 'The credential value used by the subscriber',
          },
          {
            displayName: 'Organization ID',
            name: 'organizationId',
            type: 'string',
            default: '',
            description: 'Customer or department ID from non-Revenium systems',
          },
          {
            displayName: 'Subscription ID',
            name: 'subscriptionId',
            type: 'string',
            default: '',
            description: 'Reference to a billing plan in non-Revenium systems',
          },
          {
            displayName: 'Product ID',
            name: 'productId',
            type: 'string',
            default: '',
            description: 'Your product or feature making the AI call',
          },
          {
            displayName: 'Agent',
            name: 'agent',
            type: 'string',
            default: '',
            description: 'Identifier for the specific AI agent',
          },
          {
            displayName: 'Response Quality Score',
            name: 'responseQualityScore',
            type: 'number',
            default: undefined,
            typeOptions: { minValue: 0, maxValue: 10, numberPrecision: 2 },
            description: 'Quality rating for the AI response (0-10)',
          },
        ],
      },
    ],
  };

  // Define methods that can be called for loadOptions
  methods = {
    loadOptions: {
      // Method to load available models dynamically
      async getModels(
        this: ILoadOptionsFunctions
      ): Promise<INodePropertyOptions[]> {
        console.log('🔍 Loading available OpenAI models dynamically...');

        // Fallback models based on popularity and real-world usage (Nov 2025)
        const fallbackModels: INodePropertyOptions[] = [
          { name: 'GPT-5.1', value: 'gpt-5.1' },
          { name: 'GPT-5.1 Codex', value: 'gpt-5.1-codex' },
          { name: 'GPT-5', value: 'gpt-5' },
          { name: 'GPT-5 mini', value: 'gpt-5-mini' },
          { name: 'GPT-5 nano', value: 'gpt-5-nano' },
          { name: 'GPT-4.1', value: 'gpt-4.1' },
          { name: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
          { name: 'GPT-4o', value: 'gpt-4o' },
          { name: 'GPT-4o mini', value: 'gpt-4o-mini' },
          { name: 'o3', value: 'o3' },
          { name: 'o3 mini', value: 'o3-mini' },
          { name: 'o4 mini', value: 'o4-mini' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        ];

        try {
          // Get credentials with validation
          const rawCredentials = await this.getCredentials('reveniumOpenAI');
          const credentials = validateCredentials(rawCredentials);

          if (!credentials.openaiApiKey) {
            logger.warning('No OpenAI API key found, using fallback models');
            return fallbackModels;
          }

          // Validate base URL if provided
          const baseURL =
            credentials.openaiBaseUrl || 'https://api.openai.com/v1';
          try {
            // Use secure URL validation instead of basic URL parsing
            const allowedUrls = [
              'https://api.openai.com/v1',
              'https://api.openai.com',
            ];
            validateSecureUrl(baseURL, allowedUrls, 'OpenAI base URL');
          } catch (error) {
            const errorDetails = getErrorDetails(error);
            logger.warning(
              'Invalid OpenAI base URL (%s), using default',
              errorDetails.message
            );
            // Fall back to default URL - this is already set above
          }

          // Get timeout configuration
          const timeouts = getTimeoutConfig();

          // Create OpenAI client with proper error handling
          const openai = new OpenAI({
            apiKey: credentials.openaiApiKey,
            baseURL,
            timeout: timeouts.apiTimeout,
            maxRetries: 1,
          });

          logger.debug('Fetching models from OpenAI API...');

          // Fetch models from OpenAI API with timeout and retry logic
          const modelsResponse = await Promise.race([
            openai.models.list(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    createReveniumError(
                      'OpenAI API timeout',
                      undefined,
                      'API_TIMEOUT'
                    )
                  ),
                timeouts.apiTimeout
              )
            ),
          ]);

          if (!modelsResponse || !Array.isArray(modelsResponse)) {
            logger.warning(
              'Invalid response from OpenAI API, using fallback models'
            );
            return fallbackModels;
          }

          const models = modelsResponse;
          logger.debug('Retrieved %d models from OpenAI API', models.length);

          // Exclude models that are obviously NOT for chat completions with proper type checking
          const chatModels = models.filter((model: unknown) => {
            if (!hasValidId(model)) {
              return false;
            }

            const modelId = model.id.toLowerCase();

            // Exclude models that are obviously NOT for chat completions
            const excludePatterns = [
              // Image generation models
              'dall-e',
              // Embedding models
              'text-embedding',
              'embedding',
              // Text-to-speech models
              'tts-',
              // Speech-to-text models
              'whisper',
              // Moderation models
              'moderation',
              // Old completion models (not chat)
              'davinci-002',
              'babbage-002',
              'curie',
              'ada',
              // Instruct models (completion, not chat)
              '-instruct',
              // Fine-tuning base models
              'davinci:',
              'curie:',
              'babbage:',
              'ada:',
            ];

            // Exclude if model matches any exclusion pattern
            return !excludePatterns.some(pattern => modelId.includes(pattern));
          });

          // Popularity-based sorting: prioritize by real-world usage and availability
          const sortedModels = chatModels.sort((a: unknown, b: unknown) => {
            // Type guard to ensure we have valid model objects
            if (!hasValidId(a) || !hasValidId(b)) {
              return 0;
            }

            const aId = a.id.toLowerCase();
            const bId = b.id.toLowerCase();

            // Priority order based on popularity and real-world usage (Nov 2025)
            const getPriority = (id: string) => {
              // GPT-5.1 series - latest flagship (released Nov 2025)
              if (id === 'gpt-5.1') return 1050;
              if (id === 'gpt-5.1-codex') return 1045;
              if (id === 'gpt-5.1-codex-mini') return 1040;
              if (id.startsWith('gpt-5.1')) return 1030;

              // GPT-5 series (released Aug 2025)
              if (id === 'gpt-5') return 1000;
              if (id === 'gpt-5-mini') return 990;
              if (id === 'gpt-5-nano') return 980;
              if (id.startsWith('gpt-5')) return 970;

              // GPT-4.1 series (April 2025 - improved coding/instruction following)
              if (id === 'gpt-4.1') return 950;
              if (id === 'gpt-4.1-mini') return 945;
              if (id === 'gpt-4.1-nano') return 940;
              if (id.startsWith('gpt-4.1')) return 935;

              // GPT-4o series (still excellent for multimodal)
              if (id === 'gpt-4o') return 900;
              if (id === 'gpt-4o-mini') return 890;
              if (
                id.includes('gpt-4o') &&
                (id.includes('2024-11-20') || id.includes('2024-08-06'))
              )
                return 880;
              if (id.includes('gpt-4o') && id.includes('2024')) return 870;

              // Reasoning models (o3/o4 series - current generation)
              if (id === 'o3') return 850;
              if (id === 'o3-mini') return 845;
              if (id.startsWith('o3-')) return 840;
              if (id === 'o4-mini') return 830;
              if (id.startsWith('o4-')) return 825;

              // Legacy reasoning models (o1 series)
              if (id === 'o1-preview') return 800;
              if (id === 'o1-mini') return 795;
              if (id.startsWith('o1-')) return 790;

              // GPT-4 series (legacy but still supported)
              if (id === 'gpt-4-turbo') return 700;
              if (id === 'gpt-4') return 690;
              if (
                id.includes('gpt-4') &&
                !id.includes('gpt-4o') &&
                !id.includes('gpt-4.1')
              )
                return 680;

              // GPT-3.5 series (cost-effective option)
              if (id === 'gpt-3.5-turbo') return 600;
              if (id.includes('gpt-3.5')) return 590;

              // ChatGPT models (consumer interface variants)
              if (id.includes('chatgpt')) return 500;

              // Preview/experimental features (audio, realtime, search, etc.)
              if (
                id.includes('audio') ||
                id.includes('realtime') ||
                id.includes('search')
              )
                return 400;

              // Future GPT series (auto-handle gpt-6, etc.)
              const gptMatch = id.match(/gpt-(\d+(?:\.\d+)?)/);
              if (gptMatch && gptMatch[1]) {
                const version = parseFloat(gptMatch[1]);
                if (version >= 6) return 300; // Future versions
              }

              // Everything else (including future unknown model types)
              return 100;
            };

            const priorityDiff = getPriority(bId) - getPriority(aId); // Reverse for descending
            if (priorityDiff !== 0) return priorityDiff;

            // If same priority, sort by model creation date (newer first) if available
            if (hasCreatedProperty(a) && hasCreatedProperty(b)) {
              return b.created - a.created;
            }

            // Final fallback: alphabetical
            return aId.localeCompare(bId);
          });

          // Future-proof naming: convert model IDs to readable display names
          const modelOptions: INodePropertyOptions[] = sortedModels.map(
            (model: unknown) => {
              // Type guard to ensure we have a valid model object
              if (!hasValidId(model)) {
                return { name: 'Unknown Model', value: 'unknown' };
              }

              const modelId = model.id;
              let displayName = modelId;

              // Pattern-based naming for future compatibility
              if (modelId.match(/^o\d+-/)) {
                // Reasoning models: o1-preview, o3-mini, o4-mini, etc.
                displayName = modelId; // Keep original format for reasoning models
              } else if (modelId === 'gpt-4o') {
                displayName = 'GPT-4o';
              } else if (modelId === 'gpt-4o-mini') {
                displayName = 'GPT-4o mini';
              } else if (
                modelId.startsWith('gpt-4o-') &&
                modelId.match(/\d{4}-\d{2}-\d{2}/)
              ) {
                // GPT-4o with date: gpt-4o-2024-11-20 → GPT-4o (2024-11-20)
                const parts = modelId.split('-');
                const dateStr = parts.slice(2).join('-');
                displayName = `GPT-4o (${dateStr})`;
              } else if (modelId.startsWith('gpt-4o-')) {
                // Other GPT-4o variants: gpt-4o-audio-preview → GPT-4o (audio-preview)
                const variant = modelId.replace('gpt-4o-', '');
                displayName = `GPT-4o (${variant})`;
              } else if (modelId.startsWith('chatgpt-')) {
                // Future ChatGPT variants
                displayName = modelId.replace('chatgpt-', 'ChatGPT ');
              } else if (modelId === 'gpt-4-turbo') {
                displayName = 'GPT-4 Turbo';
              } else if (modelId === 'gpt-4') {
                displayName = 'GPT-4';
              } else if (modelId === 'gpt-3.5-turbo') {
                displayName = 'GPT-3.5 Turbo';
              } else if (modelId.match(/^gpt-(\d+(\.\d+)?)-?(.*)$/)) {
                // Future GPT versions: gpt-5, gpt-4.5, gpt-6-turbo, etc.
                const match = modelId.match(/^gpt-(\d+(?:\.\d+)?)-?(.*)$/);
                if (match) {
                  const version = match[1];
                  const variant = match[2];
                  if (variant) {
                    displayName = `GPT-${version} ${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
                  } else {
                    displayName = `GPT-${version}`;
                  }
                }
              } else {
                // Generic cleanup for unknown future models
                displayName = modelId
                  .replace(/^gpt-/, 'GPT-')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase());
              }

              return {
                name: displayName,
                value: modelId,
              };
            }
          );

          if (modelOptions.length === 0) {
            logger.warning(
              'No suitable chat models found in API response, using fallback'
            );
            return fallbackModels;
          }

          logger.info(
            'Successfully loaded %d OpenAI chat models',
            modelOptions.length
          );
          return modelOptions;
        } catch (error) {
          const errorDetails = getErrorDetails(error);
          logger.warning(
            'Failed to load models from OpenAI API: %s',
            errorDetails.message
          );

          // Log additional context in development mode
          if (process.env.NODE_ENV === 'development') {
            logger.debug('Model loading error details: %O', errorDetails);
          }

          logger.info('Using fallback model list');
          return fallbackModels;
        }
      },
    },
  };

  // This is the critical method that makes this a Chat Model
  // It must implement the IChatModel interface
  async supplyData(
    this: ISupplyDataFunctions,
    itemIndex: number
  ): Promise<SupplyData> {
    logger.debug('Revenium Chat Model - supplyData called');

    // Get credentials using the proper n8n context
    const rawCredentials = await this.getCredentials('reveniumOpenAI');
    const credentials = validateCredentials(rawCredentials);

    // Get model selection mode and model ID with validation
    const modelMode = this.getNodeParameter('model', itemIndex) as string;
    const modelId = this.getNodeParameter('modelId', itemIndex) as string;

    // Validate model parameters
    if (
      !modelId ||
      typeof modelId !== 'string' ||
      modelId.trim().length === 0
    ) {
      throw new NodeOperationError(
        this.getNode(),
        'Model ID is required and must be a non-empty string'
      );
    }

    // Validate model mode
    if (!modelMode || !['fromList', 'byId'].includes(modelMode)) {
      throw new NodeOperationError(
        this.getNode(),
        'Invalid model selection mode'
      );
    }

    // Both "fromList" and "byId" use the same modelId parameter
    const modelName = modelId.trim();

    // Validate model name format with comprehensive validation
    try {
      validateModelName(modelName);
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      throw new NodeOperationError(
        this.getNode(),
        `Model name validation failed: ${errorDetails.message}`
      );
    }

    const options = this.getNodeParameter(
      'options',
      itemIndex,
      {}
    ) as N8nNodeOptions;
    const usageMetadata = this.getNodeParameter(
      'usageMetadata',
      itemIndex,
      {}
    ) as UsageMetadata;

    // Validate numeric options with comprehensive validation
    try {
      validateNumericParameter(options.temperature, 'temperature', 0, 2, true);
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      throw new NodeOperationError(
        this.getNode(),
        `Temperature validation failed: ${errorDetails.message}`
      );
    }

    try {
      if (
        options.maxTokens !== undefined &&
        options.maxTokens !== null &&
        options.maxTokens !== -1
      ) {
        validateNumericParameter(
          options.maxTokens,
          'maxTokens',
          1,
          100000,
          false
        );
      }
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      throw new NodeOperationError(
        this.getNode(),
        `Max tokens validation failed: ${errorDetails.message}`
      );
    }
    // Validate timeout parameter with comprehensive validation
    try {
      validateTimeout(options.timeout, true);
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      throw new NodeOperationError(
        this.getNode(),
        `Timeout validation failed: ${errorDetails.message}`
      );
    }

    // Create ChatOpenAI instance with proper configuration and Revenium tracking
    const baseURL = credentials.openaiBaseUrl || 'https://api.openai.com/v1';

    // Log configuration without sensitive data
    logger.debug('Using OpenAI base URL: %s', baseURL);
    logger.debug('Model selection: %s = %s', modelMode, modelName);
    logger.debug(
      'Configuration options: temperature=%s, maxTokens=%s, timeout=%s, hasUsageMetadata=%s',
      options.temperature,
      options.maxTokens,
      options.timeout,
      !!usageMetadata && Object.keys(usageMetadata).length > 0
    );

    const isReasoning = isReasoningModel(modelName);
    if (isReasoning) {
      logger.debug(
        'Detected reasoning model (%s) - temperature parameter will be omitted',
        modelName
      );
    }

    const chatModelConfig: Record<string, unknown> = {
      apiKey: credentials.openaiApiKey,
      modelName,
      maxTokens: options.maxTokens || -1,
      topP: options.topP || 1,
      frequencyPenalty: options.frequencyPenalty || 0,
      presencePenalty: options.presencePenalty || 0,
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 2,
      configuration: {
        baseURL,
      },
    };

    if (!isReasoning) {
      chatModelConfig.temperature = options.temperature || 0.7;
    }

    const chatModel = new ReveniumTrackedChatOpenAI(chatModelConfig, {
      ...credentials,
      usageMetadata,
    });

    logger.debug(
      'Revenium Chat Model - returning LangChain ChatOpenAI with tracking'
    );

    return {
      response: chatModel,
    };
  }
}
