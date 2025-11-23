import dotenv from 'dotenv';
import { Config } from '../types/config';

// Load environment variables
dotenv.config();

const config: Config = {
  host: process.env.BACKEND_HOST || '0.0.0.0',
  port: parseInt(process.env.BACKEND_PORT || '3002', 10),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  strictRateLimitWindowMs: parseInt(process.env.STRICT_RATE_LIMIT_WINDOW_MS || '3600000', 10),
  strictRateLimitMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS || '10', 10),
  tempDir: process.env.TEMP_DIR || '/tmp/snap-dns'
};

// Validate required config
if (!config.host || !config.port) {
  throw new Error('Missing required configuration');
}

// Log config on startup
console.log('Loaded configuration:', {
  ...config,
  allowedOrigins: config.allowedOrigins
});

export { config }; 