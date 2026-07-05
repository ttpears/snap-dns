// src/types/config.ts
import type { WebhookProvider } from './webhook';

export interface Config {
  defaultTTL?: number;
  webhookUrl?: string | null;
  webhookProvider?: WebhookProvider;
  rowsPerPage?: number;
}

export function ensureValidConfig(config: Partial<Config>): Config {
  return {
    defaultTTL: config.defaultTTL || 3600,
    webhookUrl: config.webhookUrl || null,
    webhookProvider: config.webhookProvider || null,
    rowsPerPage: config.rowsPerPage || 10,
  };
}

// Re-export for convenience
export type { WebhookProvider };
