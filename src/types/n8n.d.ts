// Custom type overrides for n8n build
declare module 'openai' {
  interface ChatCompletion {
    id: string;
    model: string;
    choices: Array<{
      message: {
        role: string;
        content: string;
      };
      finish_reason: string | null;
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      prompt_tokens_details?: {
        cached_tokens: number;
      };
    };
    system_fingerprint?: string | null;
  }
} 