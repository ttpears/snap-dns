// backend/src/routes/apiKeyRoutes.ts
import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { ApiKeyCreateData, ApiKeyScope } from '../types/apiKey';
import { apiKeyService } from '../services/apiKeyService';
import { auditService, AuditEventType } from '../services/auditService';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/api-keys:
 *   post:
 *     tags:
 *       - API Keys
 *     summary: Create API Key
 *     description: Create a new API key for programmatic access. The key is shown only once at creation.
 *     security:
 *       - BearerAuth: []
 *       - SessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - scopes
 *             properties:
 *               name:
 *                 type: string
 *                 description: Human-readable name for the API key
 *                 example: Production API Key
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write, admin]
 *                 description: Permissions granted to this key
 *                 example: [read, write]
 *               expiresInDays:
 *                 type: integer
 *                 minimum: 1
 *                 description: Number of days until expiration (optional, omit for never)
 *                 example: 90
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                       description: The plain API key - shown only once!
 *                       example: snap_iKgjCtt0qDZq264B7C7R83Xk1pea4xmo
 *                     metadata:
 *                       $ref: '#/components/schemas/ApiKey'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, scopes, expiresInDays } = req.body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Name is required',
        code: 'INVALID_INPUT'
      });
      return;
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one scope is required',
        code: 'INVALID_INPUT'
      });
      return;
    }

    // Validate scopes
    const validScopes = Object.values(ApiKeyScope);
    for (const scope of scopes) {
      if (!validScopes.includes(scope)) {
        res.status(400).json({
          success: false,
          error: `Invalid scope: ${scope}`,
          code: 'INVALID_SCOPE'
        });
        return;
      }
    }

    // Only admins can create keys with ADMIN scope
    if (scopes.includes(ApiKeyScope.ADMIN) && authReq.user!.role !== UserRole.ADMIN) {
      res.status(403).json({
        success: false,
        error: 'Only administrators can create API keys with ADMIN scope',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Validate expiresInDays if provided
    if (expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || expiresInDays < 1) {
        res.status(400).json({
          success: false,
          error: 'expiresInDays must be a positive number',
          code: 'INVALID_INPUT'
        });
        return;
      }
    }

    const createData: ApiKeyCreateData = {
      name: name.trim(),
      scopes,
      expiresInDays
    };

    // Create the API key
    const result = await apiKeyService.createApiKey(authReq.user!.userId, createData);

    // Log to audit
    await auditService.log(AuditEventType.API_KEY_CREATED, {
      userId: authReq.user!.userId,
      username: authReq.user!.username,
      success: true,
      details: {
        apiKeyId: result.metadata.id,
        name: result.metadata.name,
        scopes: result.metadata.scopes,
        expiresAt: result.metadata.expiresAt
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * @openapi
 * /api/api-keys:
 *   get:
 *     tags:
 *       - API Keys
 *     summary: List API Keys
 *     description: Get all API keys for the authenticated user
 *     security:
 *       - BearerAuth: []
 *       - SessionAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;

    // Users can only see their own keys
    const keys = await apiKeyService.listUserKeys(authReq.user!.userId);

    res.json({
      success: true,
      data: keys
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * Delete an API key
 * DELETE /api/api-keys/:id
 * Requires: Authentication (session or API key)
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const keyId = req.params.id;

    if (!keyId) {
      res.status(400).json({
        success: false,
        error: 'Key ID is required',
        code: 'INVALID_INPUT'
      });
      return;
    }

    // Get the key to check ownership and for audit logging
    const key = await apiKeyService.getKeyById(keyId);
    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    // Users can only delete their own keys
    if (key.userId !== authReq.user!.userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this API key',
        code: 'FORBIDDEN'
      });
      return;
    }

    // Delete the key
    const deleted = await apiKeyService.deleteApiKey(keyId, authReq.user!.userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    // Log to audit
    await auditService.log(AuditEventType.API_KEY_DELETED, {
      userId: authReq.user!.userId,
      username: authReq.user!.username,
      success: true,
      details: {
        apiKeyId: keyId,
        name: key.name
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * Rotate an API key (generate new key value)
 * POST /api/api-keys/:id/rotate
 * Requires: Authentication (session or API key)
 */
router.post('/:id/rotate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const keyId = req.params.id;

    if (!keyId) {
      res.status(400).json({
        success: false,
        error: 'Key ID is required',
        code: 'INVALID_INPUT'
      });
      return;
    }

    // Get the key to check ownership and for audit logging
    const key = await apiKeyService.getKeyById(keyId);
    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    // Users can only rotate their own keys
    if (key.userId !== authReq.user!.userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to rotate this API key',
        code: 'FORBIDDEN'
      });
      return;
    }

    // Rotate the key
    const result = await apiKeyService.rotateApiKey(keyId, authReq.user!.userId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    // Log to audit
    await auditService.log(AuditEventType.API_KEY_ROTATED, {
      userId: authReq.user!.userId,
      username: authReq.user!.username,
      success: true,
      details: {
        apiKeyId: keyId,
        name: key.name
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rotate API key',
      code: 'SERVER_ERROR'
    });
  }
});

export default router;
