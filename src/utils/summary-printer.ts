/**
 * Summary Printer Module
 *
 * Prints cost and metrics summaries to the terminal after API requests.
 * Supports human-readable and JSON output formats.
 *
 * Note: This module uses console.log() directly for summary output,
 * which is intentional to ensure summaries are always visible to users.
 * All other logging uses the logger utility.
 */
import { CreateCompletionRequest } from '../types/index.js';
import { logger } from './logger.js';

type SummaryFormat = 'human' | 'json';

interface Config {
  reveniumApiKey?: string;
  reveniumBaseUrl?: string;
  teamId?: string;
  printSummary?: boolean | SummaryFormat;
}

let globalConfig: Config | null = null;

export function setConfig(config: Config | null): void {
  globalConfig = config;
}

/**
 * Initialize configuration from environment variables.
 * This allows the summary printer to work without explicit configuration.
 */
export function initializeConfigFromEnv(): void {
  if (!globalConfig) {
    globalConfig = {
      reveniumApiKey: process.env.REVENIUM_METERING_API_KEY,
      reveniumBaseUrl: process.env.REVENIUM_METERING_BASE_URL,
      teamId: process.env.REVENIUM_TEAM_ID,
      printSummary: process.env.REVENIUM_PRINT_SUMMARY as
        | boolean
        | SummaryFormat
        | undefined,
    };
  }
}

function getConfig(): Config | null {
  return globalConfig;
}

const DEFAULT_REVENIUM_BASE_URL = 'https://api.revenium.ai';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

interface CompletionMetrics {
  id?: string;
  transactionId?: string;
  model?: string;
  provider?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  inputTokenCost?: number;
  outputTokenCost?: number;
  totalCost?: number;
  requestDuration?: number;
}

interface CompletionsApiResponse {
  _embedded?: {
    aICompletionMetricResourceList?: CompletionMetrics[];
  };
}

function delayWithUnref(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

async function fetchCompletionMetrics(
  transactionId: string,
  maxRetries: number = MAX_RETRIES,
  retryDelay: number = RETRY_DELAY
): Promise<CompletionMetrics | null> {
  const config = getConfig();
  if (!config) {
    logger.debug('No config available for summary printing');
    return null;
  }

  if (!config.teamId) {
    logger.debug('Team ID not configured, skipping cost retrieval for summary');
    return null;
  }

  // Early return if API key is missing to avoid wasted retries
  if (!config.reveniumApiKey) {
    logger.debug(
      'Revenium API key not configured, skipping cost retrieval for summary'
    );
    return null;
  }

  const baseUrl = (config.reveniumBaseUrl || DEFAULT_REVENIUM_BASE_URL).replace(
    /\/+$/,
    ''
  );
  const url = `${baseUrl}/profitstream/v2/api/sources/metrics/ai/completions`;
  const urlWithParams = `${url}?teamId=${encodeURIComponent(
    config.teamId.trim()
  )}&transactionId=${encodeURIComponent(transactionId)}`;

  logger.debug('Fetching completion metrics', { url: urlWithParams });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Create AbortController with timeout to prevent hung requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // Unref the timeout so it doesn't prevent process exit
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    try {
      const response = await fetch(urlWithParams, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-api-key': config.reveniumApiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        try {
          await response.text();
        } catch {}
        logger.debug(`Completions metrics API returned ${response.status}`, {
          attempt: attempt + 1,
        });
        if (attempt < maxRetries - 1) {
          await delayWithUnref(retryDelay);
          continue;
        }
        return null;
      }

      const data = (await response.json()) as CompletionsApiResponse;
      const completions = data._embedded?.aICompletionMetricResourceList;

      if (completions && completions.length > 0) {
        return completions[0];
      }

      if (attempt < maxRetries - 1) {
        logger.debug(
          `Waiting for metrics to aggregate (attempt ${
            attempt + 1
          }/${maxRetries})...`
        );
        await delayWithUnref(retryDelay);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      logger.debug('Failed to fetch completion metrics', {
        error: error instanceof Error ? error.message : String(error),
        attempt: attempt + 1,
      });
      if (attempt < maxRetries - 1) {
        await delayWithUnref(retryDelay);
      }
    }
  }

  return null;
}

function isSummaryFormat(value: unknown): value is SummaryFormat {
  return value === 'human' || value === 'json';
}

interface JsonSummary {
  model: string;
  provider: string;
  durationSeconds: number;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  cost: number | null;
  costStatus?: 'pending' | 'unavailable';
  traceId?: string;
}

function formatAndPrintJsonSummary(
  payload: CreateCompletionRequest,
  metrics?: CompletionMetrics | null
): void {
  const config = getConfig();

  const summary: JsonSummary = {
    model: payload.model,
    provider: payload.provider,
    durationSeconds: payload.requestDuration / 1000,
    inputTokenCount: payload.inputTokenCount,
    outputTokenCount: payload.outputTokenCount,
    totalTokenCount: payload.totalTokenCount,
    cost: typeof metrics?.totalCost === 'number' ? metrics.totalCost : null,
  };

  if (summary.cost === null) {
    summary.costStatus = config?.teamId ? 'pending' : 'unavailable';
  }

  if (payload.traceId) {
    summary.traceId = payload.traceId;
  }

  console.log(JSON.stringify(summary));
}

function formatAndPrintHumanSummary(
  payload: CreateCompletionRequest,
  metrics?: CompletionMetrics | null
): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 REVENIUM USAGE SUMMARY');
  console.log('='.repeat(60));

  console.log(`🤖 Model: ${payload.model}`);
  console.log(`🏢 Provider: ${payload.provider}`);
  console.log(`⏱️  Duration: ${(payload.requestDuration / 1000).toFixed(2)}s`);

  console.log('\n💬 Token Usage:');
  console.log(
    `   📥 Input Tokens:  ${(payload.inputTokenCount ?? 0).toLocaleString()}`
  );
  console.log(
    `   📤 Output Tokens: ${(payload.outputTokenCount ?? 0).toLocaleString()}`
  );
  console.log(
    `   📊 Total Tokens:  ${(payload.totalTokenCount ?? 0).toLocaleString()}`
  );

  if (typeof metrics?.totalCost === 'number') {
    console.log(`\n💰 Cost: $${metrics.totalCost.toFixed(6)}`);
  } else {
    const config = getConfig();
    if (!config?.teamId) {
      console.log(`\n💰 Cost: Set REVENIUM_TEAM_ID in .env to see pricing`);
    } else {
      console.log(`\n💰 Cost: (pending aggregation)`);
    }
  }

  if (payload.traceId) {
    console.log(`\n🔖 Trace ID: ${payload.traceId}`);
  }

  console.log('='.repeat(60) + '\n');
}

function formatAndPrintSummary(
  payload: CreateCompletionRequest,
  metrics: CompletionMetrics | null | undefined,
  format: SummaryFormat
): void {
  if (format === 'json') {
    formatAndPrintJsonSummary(payload, metrics);
  } else {
    formatAndPrintHumanSummary(payload, metrics);
  }
}

function safeFormatAndPrintSummary(
  payload: CreateCompletionRequest,
  metrics: CompletionMetrics | null | undefined,
  format: SummaryFormat
): void {
  try {
    formatAndPrintSummary(payload, metrics, format);
  } catch (error) {
    logger.debug('Failed to format and print summary', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getSummaryFormat(
  value: boolean | SummaryFormat | undefined
): SummaryFormat | null {
  if (!value) return null;
  if (value === true) return 'human';
  if (isSummaryFormat(value)) {
    return value;
  }
  return null;
}

export function printUsageSummary(payload: CreateCompletionRequest): void {
  const config = getConfig();
  const format = getSummaryFormat(config?.printSummary);

  if (!format) {
    return;
  }

  if (config?.teamId && payload.transactionId) {
    fetchCompletionMetrics(payload.transactionId)
      .then(metrics => {
        safeFormatAndPrintSummary(payload, metrics, format);
      })
      .catch(error => {
        logger.debug('Failed to print usage summary with metrics', {
          error: error instanceof Error ? error.message : String(error),
        });
        safeFormatAndPrintSummary(payload, null, format);
      })
      .catch(() => {});
  } else {
    safeFormatAndPrintSummary(payload, null, format);
  }
}
