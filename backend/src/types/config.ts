// backend/src/types/config.ts
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
  tempDir: string;
  keys?: Key[];
  webhookProvider?: WebhookProvider;
}
