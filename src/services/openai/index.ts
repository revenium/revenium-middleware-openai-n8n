/**
 * OpenAI service for API interactions and model management
 */

import type { INodePropertyOptions } from 'n8n-workflow';
import OpenAI from 'openai';

import type { ReveniumOpenAICredentials } from '../../types/index.js';
import { 
  validateSecureUrl, 
  validateModelName, 
  getTimeoutConfig, 
  createReveniumError, 
  getErrorDetails,
  hasCreatedProperty 
} from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import { FALLBACK_MODELS, MODEL_PRIORITIES } from '../../constants/constants.js';

/**
 * OpenAI service configuration
 */
export interface OpenAIServiceConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * OpenAI service class for managing API interactions
 */
export class OpenAIService {
  private client: OpenAI;
  private config: OpenAIServiceConfig;

  constructor(config: OpenAIServiceConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  /**
   * Create OpenAI client with proper configuration
   */
  private createClient(): OpenAI {
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';
    const timeouts = getTimeoutConfig();

    // Validate base URL
    try {
      const allowedUrls = ['https://api.openai.com/v1', 'https://api.openai.com'];
      validateSecureUrl(baseURL, allowedUrls, 'OpenAI base URL');
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.warning('Invalid OpenAI base URL (%s), using default', errorDetails.message);
    }

    return new OpenAI({
      apiKey: this.config.apiKey,
      baseURL,
      timeout: this.config.timeout || timeouts.apiTimeout,
      maxRetries: this.config.maxRetries || 1,
    });
  }

  /**
   * Fetch available models from OpenAI API
   */
  async getModels(): Promise<INodePropertyOptions[]> {
    try {
      logger.debug('Fetching models from OpenAI API...');
      const timeouts = getTimeoutConfig();

      // Fetch models with timeout protection
      const modelsResponse = await Promise.race([
        this.client.models.list(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(createReveniumError('OpenAI API timeout', undefined, 'API_TIMEOUT')), timeouts.apiTimeout)
        )
      ]);

      if (!modelsResponse || !Array.isArray(modelsResponse)) {
        logger.warning('Invalid response from OpenAI API, using fallback models');
        return FALLBACK_MODELS;
      }

      const models = modelsResponse;
      logger.debug('Retrieved %d models from OpenAI API', models.length);

      // Filter for chat models and create options
      const modelOptions = models
        .filter(model => this.isChatModel(model.id))
        .map(model => ({
          name: this.formatModelName(model.id),
          value: model.id,
          description: `OpenAI ${model.id} model`,
        }))
        .sort((a, b) => {
          // Sort by priority first
          const aPriority = MODEL_PRIORITIES[a.value] || 999;
          const bPriority = MODEL_PRIORITIES[b.value] || 999;
          
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          
          // If same priority, sort by model creation date (newer first) if available
          if (hasCreatedProperty(a) && hasCreatedProperty(b)) {
            return b.created - a.created;
          }
          
          // Final fallback: alphabetical
          return a.value.localeCompare(b.value);
        });

      if (modelOptions.length === 0) {
        logger.warning('No suitable chat models found in API response, using fallback');
        return FALLBACK_MODELS;
      }

      logger.info('Successfully loaded %d OpenAI chat models', modelOptions.length);
      return modelOptions;

    } catch (error) {
      const errorDetails = getErrorDetails(error);
      logger.warning('Failed to load models from OpenAI API: %s', errorDetails.message);

      // Log additional context in development mode
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Model loading error details: %O', errorDetails);
      }

      logger.info('Using fallback model list');
      return FALLBACK_MODELS;
    }
  }

  /**
   * Check if a model ID represents a chat model
   */
  private isChatModel(modelId: string): boolean {
    const chatModelPatterns = [
      /^gpt-4/,
      /^gpt-3\.5-turbo/,
      /^gpt-35-turbo/,
      /^text-davinci/,
      /^chatgpt/
    ];

    return chatModelPatterns.some(pattern => pattern.test(modelId));
  }

  /**
   * Format model name for display
   */
  private formatModelName(modelId: string): string {
    // Convert model ID to human-readable name
    const nameMap: Record<string, string> = {
      'gpt-4o': 'GPT-4o (Latest)',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-3.5-turbo-16k': 'GPT-3.5 Turbo 16K',
    };

    return nameMap[modelId] || modelId.toUpperCase();
  }

  /**
   * Validate model name
   */
  validateModel(modelName: string): boolean {
    return validateModelName(modelName);
  }

  /**
   * Create service instance from credentials
   */
  static fromCredentials(credentials: ReveniumOpenAICredentials): OpenAIService {
    return new OpenAIService({
      apiKey: credentials.openaiApiKey,
      baseURL: credentials.openaiBaseUrl,
    });
  }
}
