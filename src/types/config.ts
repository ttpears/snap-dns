import type { WebhookProvider } from './webhook';
import { Key } from './keys';

export interface Config {
  keys: Key[];
  defaultTTL?: number;
  webhookUrl?: string | null;
  webhookProvider?: WebhookProvider;
  rowsPerPage?: number;
}

export function ensureValidConfig(config: Partial<Config>): Config {
  return {
    keys: config.keys || [],
    defaultTTL: config.defaultTTL || 3600,
    webhookUrl: config.webhookUrl || null,
    webhookProvider: config.webhookProvider || null,
    rowsPerPage: config.rowsPerPage || 10,
  };
}

// Re-export for convenience
export type { WebhookProvider }; 