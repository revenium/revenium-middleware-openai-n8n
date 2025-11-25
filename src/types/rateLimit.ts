/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
  }
  

/**
 * Rate limiting state
 */
export interface RateLimitState {
    requestsThisMinute: number;
    requestsThisHour: number;
    minuteWindowStart: number;
    hourWindowStart: number;
  }
  