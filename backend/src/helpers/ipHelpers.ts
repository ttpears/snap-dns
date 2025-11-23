// backend/src/helpers/ipHelpers.ts
// Helper functions for extracting real client IP addresses from proxy headers

import { Request } from 'express';

/**
 * Extract the real client IP address from request headers
 * Handles X-Forwarded-For, X-Real-IP, and other proxy headers
 *
 * Priority:
 * 1. X-Forwarded-For (first IP in the list)
 * 2. X-Real-IP
 * 3. req.ip (fallback to direct connection IP)
 */
export function getClientIp(req: Request): string | undefined {
  // Check X-Forwarded-For header (most common with proxies)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For can be a comma-separated list of IPs
    // Format: client, proxy1, proxy2, ...
    // We want the first one (the original client)
    const ips = typeof xForwardedFor === 'string'
      ? xForwardedFor.split(',').map(ip => ip.trim())
      : xForwardedFor;

    if (Array.isArray(ips) && ips.length > 0) {
      return ips[0];
    } else if (typeof ips === 'string') {
      return ips;
    }
  }

  // Check X-Real-IP header (used by some proxies like Nginx)
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp && typeof xRealIp === 'string') {
    return xRealIp;
  }

  // Fallback to req.ip (direct connection or last resort)
  return req.ip;
}

/**
 * Get all relevant IP information for debugging
 */
export function getIpDebugInfo(req: Request): {
  clientIp: string | undefined;
  xForwardedFor: string | string[] | undefined;
  xRealIp: string | undefined;
  reqIp: string | undefined;
} {
  return {
    clientIp: getClientIp(req),
    xForwardedFor: req.headers['x-forwarded-for'],
    xRealIp: req.headers['x-real-ip'] as string | undefined,
    reqIp: req.ip,
  };
}
