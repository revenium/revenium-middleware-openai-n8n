/**
 * URL Builder Utilities
 *
 * Centralized URL construction logic for Revenium API endpoints.
 * Copied from revenium-middleware-openai-node for consistency.
 */

/**
 * Build Revenium API URL with proper path handling
 *
 * This function intelligently handles base URLs and ensures the correct path structure.
 * Logic:
 * - If URL has /meter/v2 → append endpoint as-is
 * - If URL has /meter only → append /v2 and endpoint
 * - If URL has neither → append /meter/v2 and endpoint
 *
 * Examples:
 * - 'https://api.revenium.ai' + '/ai/completions' → 'https://api.revenium.ai/meter/v2/ai/completions'
 * - 'https://api.revenium.ai/meter' + '/ai/completions' → 'https://api.revenium.ai/meter/v2/ai/completions'
 * - 'https://api.revenium.ai/meter/v2' + '/ai/completions' → 'https://api.revenium.ai/meter/v2/ai/completions'
 *
 * @param baseUrl - The base URL from configuration (may include /meter or /meter/v2)
 * @param endpoint - The API endpoint to append (e.g., '/ai/completions')
 * @returns Complete URL for the API call
 */
export function buildReveniumUrl(baseUrl: string, endpoint: string): string {
  let normalizedBase = baseUrl.replace(/\/+$/, '');

  const hasMeterV2AtEnd = /\/meter\/v2$/i.test(normalizedBase);
  if (hasMeterV2AtEnd) {
    return `${normalizedBase}${endpoint}`;
  }

  const hasMeterAtEnd = /\/meter$/i.test(normalizedBase);
  if (hasMeterAtEnd) {
    return `${normalizedBase}/v2${endpoint}`;
  }

  const hasV2AtEnd = /\/v2$/i.test(normalizedBase);
  if (hasV2AtEnd) {
    return `${normalizedBase}${endpoint}`;
  }

  return `${normalizedBase}/meter/v2${endpoint}`;
}

/**
 * Validate URL format
 *
 * @param url - URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
