import type { WebhookProvider } from './webhook';
import { Key } from './keys';

export interface Config {
  defaultTTL: number;
  webhookUrl: string | null;
  webhookProvider: WebhookProvider;
  keys: Key[];
}

export function ensureValidConfig(config: Partial<Config>): Config {
  return {
    defaultTTL: config.defaultTTL ?? 3600,
    webhookUrl: config.webhookUrl ?? null,
    webhookProvider: config.webhookProvider ?? null,
    keys: config.keys ?? []
  };
}

// Re-export for convenience
export type { WebhookProvider }; 