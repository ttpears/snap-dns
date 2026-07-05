// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth';

/**
 * Middleware to check if user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (!req.session || !req.session.userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  // Attach user data to request
  authReq.user = {
    userId: req.session.userId!,
    username: req.session.username!,
    role: req.session.role!,
    allowedKeyIds: req.session.allowedKeyIds!,
    allowedZones: req.session.allowedZones || [],
  };

  next();
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
