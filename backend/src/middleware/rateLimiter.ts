// backend/src/middleware/rateLimiter.ts
// Rate limiting middleware for DNS operations and API endpoints

import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';
import crypto from 'crypto';
import { isRateLimitEnabled } from '../config/securityToggles';

// Rate limiting is ON by default (secure) and only skipped when explicitly
// disabled via RATE_LIMIT_ENABLED=false -- not based on NODE_ENV. See
// config/securityToggles.ts for the rationale. The toggle is evaluated PER
// REQUEST (in each limiter's skip below), matching loginLimiter, so a runtime
// change takes effect without a restart and tests can flip it per file.

/**
 * Per-principal rate-limit key. Limiters run BEFORE requireAuth, so this inspects
 * the session/header directly: prefer the authenticated user, then a stable
 * fingerprint of a bearer API token (so token traffic is throttled per token
 * rather than lumped into a shared per-IP bucket, which would let co-located
 * token clients starve each other), then finally the client IP.
 */
export function principalKey(req: Request): string {
  if (req.session?.userId) {
    return `user:${req.session.userId}`;
  }
  const header = req.headers?.authorization;
  if (header && header.startsWith('Bearer sdns_')) {
    const raw = header.slice(7).trim();
    return `token:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
  }
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
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
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
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
});

/**
 * Rate limiter for TSIG key MUTATIONS (create/update/delete).
 * Strict since key management is sensitive, but only applied to mutating routes
 * — read/list stays on the general limiter so a burst of edits can never lock a
 * user out of even viewing their keys (which previously looked like data loss).
 */
export const keyManagementLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 key mutations per 5 minutes (headroom for setting up several keys)
  message: {
    success: false,
    error: 'Too many key management operations, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
});

/**
 * Rate limiter for personal API token operations (create/list/revoke)
 * Moderate per-user limits; token management is sensitive but low-frequency.
 */
export const tokenLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 token operations per 5 minutes
  message: {
    success: false,
    error: 'Too many token operations, please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
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
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
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
  // Skip only when rate limiting is explicitly disabled (default: enabled)
  skip: () => !isRateLimitEnabled(),
  keyGenerator: principalKey
});
