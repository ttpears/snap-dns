// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { authenticateApiKey } from './apiKeyAuth';

/**
 * Middleware to check if user is authenticated
 * Supports both session-based and API key authentication
 *
 * Priority:
 * 1. Check session authentication first
 * 2. Fall back to API key authentication
 * 3. Reject if neither is present
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  // Try session authentication first
  if (req.session && req.session.userId) {
    // Attach user data to request
    authReq.user = {
      userId: req.session.userId!,
      username: req.session.username!,
      role: req.session.role!,
      allowedKeyIds: req.session.allowedKeyIds!
    };
    next();
    return;
  }

  // Try API key authentication
  await authenticateApiKey(req, res, () => {
    // Check if API key authentication succeeded
    if (authReq.user) {
      next();
      return;
    }

    // Neither session nor API key authentication succeeded
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
  });
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    if (!roles.includes(authReq.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        details: {
          required: roles,
          current: authReq.user.role
        }
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user has access to a specific key
 */
export function requireKeyAccess(getKeyId: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    // Admins have access to all keys
    if (authReq.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Get the key ID from the request
    const keyId = getKeyId(req);
    if (!keyId) {
      res.status(400).json({
        success: false,
        error: 'Key ID is required',
        code: 'MISSING_KEY_ID'
      });
      return;
    }

    // Check if user has access to this key
    if (!authReq.user.allowedKeyIds.includes(keyId)) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this DNS key',
        code: 'KEY_ACCESS_DENIED',
        details: {
          keyId,
          allowedKeys: authReq.user.allowedKeyIds
        }
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user can perform write operations
 */
export function requireWriteAccess(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  // Viewers cannot perform write operations
  if (authReq.user.role === UserRole.VIEWER) {
    res.status(403).json({
      success: false,
      error: 'Read-only access',
      code: 'READ_ONLY',
      details: {
        message: 'Your account has read-only access. Contact an administrator for write permissions.'
      }
    });
    return;
  }

  next();
}

/**
 * Optional auth middleware - adds user to request if authenticated, but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (req.session && req.session.userId) {
    authReq.user = {
      userId: req.session.userId!,
      username: req.session.username!,
      role: req.session.role!,
      allowedKeyIds: req.session.allowedKeyIds!
    };
  }

  next();
}
