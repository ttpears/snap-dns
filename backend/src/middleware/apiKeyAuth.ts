// backend/src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { ApiKeyScope } from '../types/apiKey';
import { apiKeyService } from '../services/apiKeyService';

/**
 * Middleware to authenticate requests using API keys
 * Checks Authorization header for Bearer token
 * Format: Authorization: Bearer snap_...
 */
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  // Skip if already authenticated via session
  if (authReq.user) {
    next();
    return;
  }

  // Check for Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No API key provided, continue (other middleware will handle auth)
    next();
    return;
  }

  // Extract the token
  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    // Validate the API key
    const validatedKey = await apiKeyService.validateApiKey(token);

    if (!validatedKey) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired API key',
        code: 'INVALID_API_KEY'
      });
      return;
    }

    // Attach user data to request
    authReq.user = {
      userId: validatedKey.userId,
      username: validatedKey.username,
      role: validatedKey.role as UserRole,
      allowedKeyIds: validatedKey.allowedKeyIds
    };

    // Also attach the API key ID for audit logging
    (authReq as any).apiKeyId = validatedKey.key.id;
    (authReq as any).apiKeyScopes = validatedKey.key.scopes;

    next();
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Error validating API key',
      code: 'API_KEY_VALIDATION_ERROR'
    });
  }
}

/**
 * Middleware to check if the authenticated user/key has the required scope
 */
export function requireApiScope(...scopes: ApiKeyScope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as any;

    // If authenticated via session (no API key), allow all scopes
    if (authReq.user && !authReq.apiKeyId) {
      next();
      return;
    }

    // If authenticated via API key, check scopes
    if (authReq.apiKeyId && authReq.apiKeyScopes) {
      const keyScopes = authReq.apiKeyScopes as ApiKeyScope[];

      // ADMIN scope grants all permissions
      if (keyScopes.includes(ApiKeyScope.ADMIN)) {
        next();
        return;
      }

      // Check if key has at least one of the required scopes
      const hasRequiredScope = scopes.some(scope => keyScopes.includes(scope));

      if (hasRequiredScope) {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: 'API key does not have required scope',
        code: 'INSUFFICIENT_SCOPE',
        details: {
          required: scopes,
          current: keyScopes
        }
      });
      return;
    }

    // Not authenticated
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
  };
}

/**
 * Helper to check if request was authenticated via API key
 */
export function isApiKeyAuthenticated(req: Request): boolean {
  return !!(req as any).apiKeyId;
}

/**
 * Helper to get API key ID from request (if authenticated via API key)
 */
export function getApiKeyId(req: Request): string | null {
  return (req as any).apiKeyId || null;
}
