// backend/src/middleware/rateLimiter.ts
// Rate limiting middleware for DNS operations and API endpoints

import { rateLimit } from 'express-rate-limit';
import { Request } from 'express';

// Skip rate limiting in test/development environments
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

/**
 * Generate a rate limit key based on authentication method
 * Priority: API key ID > User ID > IP address
 */
function generateRateLimitKey(req: Request): string {
  // If authenticated via API key, use the API key ID
  const apiKeyId = (req as any).apiKeyId;
  if (apiKeyId) {
    return `apikey:${apiKeyId}`;
  }

  // If authenticated via session, use user ID
  if (req.session?.userId) {
    return `user:${req.session.userId}`;
  }

  // Fall back to IP address
  return req.ip || 'unknown';
}

/**
 * Rate limiter for DNS zone queries (GET operations)
 * More lenient since reading data is less risky
 */
export const dnsQueryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    success: false,
    error: 'Too many DNS queries, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  }
});

/**
 * Rate limiter for DNS modifications (POST/DELETE/PATCH operations)
 * Stricter limits since modifying DNS records is sensitive
 */
export const dnsModifyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 modifications per minute
  message: {
    success: false,
    error: 'Too many DNS modifications, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  },
  // Use API key ID or user ID as key for authenticated requests
  keyGenerator: generateRateLimitKey
});

/**
 * Rate limiter for TSIG key operations
 * Very strict since key management is highly sensitive
 */
export const keyManagementLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 key operations per 5 minutes
  message: {
    success: false,
    error: 'Too many key management operations, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  },
  keyGenerator: generateRateLimitKey
});

/**
 * Rate limiter for webhook operations
 * Moderate limits for webhook testing and configuration
 */
export const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 webhook operations per 5 minutes
  message: {
    success: false,
    error: 'Too many webhook operations, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  },
  keyGenerator: generateRateLimitKey
});

/**
 * General API rate limiter for all other endpoints
 * Prevents abuse of any endpoint
 */
export const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    success: false,
    error: 'Too many requests, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  },
  keyGenerator: generateRateLimitKey
});

/**
 * Rate limiter specifically for API key management endpoints
 * Very strict since creating/deleting API keys is sensitive
 */
export const apiKeyManagementLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 API key operations per 5 minutes
  message: {
    success: false,
    error: 'Too many API key management operations, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test/dev environments
  skip: (_req) => {
    return isTestOrDev;
  },
  keyGenerator: generateRateLimitKey
});
