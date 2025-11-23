import { Key } from './keys';
import { WebhookProvider } from './webhook';

export interface Config {
  host: string;
  port: number;
  allowedOrigins: string[];
  maxRequestSize: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  strictRateLimitWindowMs: number;
  strictRateLimitMaxRequests: number;
  tempDir?: string;
  keys?: Key[];
  webhookProvider?: WebhookProvider;
}

export function validateConfig(config: any): config is Config {
  return (
    typeof config === 'object' &&
    Array.isArray(config.keys) &&
    (config.defaultTTL === undefined || typeof config.defaultTTL === 'number') &&
    (config.webhookUrl === undefined || config.webhookUrl === null || typeof config.webhookUrl === 'string') &&
    (config.webhookProvider === undefined || config.webhookProvider === null || typeof config.webhookProvider === 'string') &&
    (config.rowsPerPage === undefined || typeof config.rowsPerPage === 'number')
  );
} 