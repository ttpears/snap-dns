import { Config } from '../types/config';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const parseArrayFromEnv = (value?: string): string[] => {
  if (!value) return [];
  return value.split(',').map(item => item.trim());
};

export const config: Config = {
  host: process.env.BACKEND_HOST || 'localhost',
  port: parseInt(process.env.BACKEND_PORT || '3002', 10),
  allowedOrigins: parseArrayFromEnv(process.env.ALLOWED_ORIGINS) || ['http://localhost:3001'],
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  strictRateLimitWindowMs: parseInt(process.env.STRICT_RATE_LIMIT_WINDOW_MS || '3600000', 10),
  strictRateLimitMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS || '10', 10)
};

// Validate required configuration
if (!config.host || !config.port) {
  throw new Error('Missing required configuration: host and port must be defined');
}

// Ensure allowedOrigins is always an array
if (!Array.isArray(config.allowedOrigins)) {
  config.allowedOrigins = ['http://localhost:3001'];
} 