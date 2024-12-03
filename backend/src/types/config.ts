export interface Config {
  host: string;
  port: number;
  allowedOrigins: string[];
  maxRequestSize: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  strictRateLimitWindowMs: number;
  strictRateLimitMaxRequests: number;
} 