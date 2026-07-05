// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { userService } from '../services/userService';

/**
 * Middleware to check if user is authenticated.
 *
 * Privileges (role/allowedKeyIds/allowedZones) are re-loaded from the user
 * store on every request rather than trusted from the login-time session copy.
 * This ensures role demotions, key/zone-allowlist revocations, and account
 * deletions take effect immediately instead of only after the session expires
 * or the user re-authenticates. Identity (userId/username) is stable and is
 * kept from the session.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  if (!req.session || !req.session.userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  try {
    // Re-load current privileges from the user store (in-memory, cheap).
    const dbUser = await userService.getUserById(req.session.userId);

    if (!dbUser) {
      // User was deleted mid-session: destroy the session so it stops working
      // immediately, then reject.
      req.session.destroy(() => {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      });
      return;
    }

    // Identity comes from the session; privileges come from the database.
    authReq.user = {
      userId: req.session.userId,
      username: req.session.username || dbUser.username,
      role: dbUser.role,
      allowedKeyIds: dbUser.allowedKeyIds,
      allowedZones: dbUser.allowedZones || [],
    };

    next();
  } catch (err) {
    next(err);
  }
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
