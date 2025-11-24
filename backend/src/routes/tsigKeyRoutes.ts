// backend/src/routes/tsigKeyRoutes.ts
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole, requireWriteAccess } from '../middleware/auth';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { tsigKeyService, TSIGKeyCreate } from '../services/tsigKeyService';
import { keyManagementLimiter } from '../middleware/rateLimiter';
import { validateTSIGKeyCreate, validateTSIGKeyUpdate } from '../middleware/validation';

const router = Router();

// Apply rate limiting to all TSIG key routes
router.use(keyManagementLimiter);

/**
 * @openapi
 * /api/tsig-keys:
 *   get:
 *     tags:
 *       - TSIG Keys
 *     summary: List TSIG Keys
 *     description: Get all TSIG keys. Admins see all keys, other users see only their allowed keys.
 *     security:
 *       - BearerAuth: []
 *       - SessionAuth: []
 *     responses:
 *       200:
 *         description: TSIG keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 keys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TSIGKey'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    // Admins see all keys, others see only their allowed keys
    const keys = user.role === UserRole.ADMIN
      ? await tsigKeyService.listKeys()
      : await tsigKeyService.listKeys(user.userId, user.allowedKeyIds);

    res.json({
      success: true,
      keys,
    });
  } catch (error) {
    console.error('List TSIG keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list TSIG keys',
    });
  }
});

/**
 * POST /api/tsig-keys
 * Create a new TSIG key (admin or editor only)
 */
router.post('/', requireAuth, requireWriteAccess, validateTSIGKeyCreate, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const keyData: TSIGKeyCreate = req.body;

    // Validate required fields
    if (!keyData.name || !keyData.server || !keyData.keyName || !keyData.keyValue || !keyData.algorithm) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        code: 'MISSING_FIELDS',
      });
    }

    const key = await tsigKeyService.createKey(user.userId, keyData);

    res.status(201).json({
      success: true,
      key,
    });
  } catch (error: any) {
    console.error('Create TSIG key error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create TSIG key',
    });
  }
});

/**
 * GET /api/tsig-keys/:keyId
 * Get a specific TSIG key (without decrypted value)
 */
router.get('/:keyId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { keyId } = req.params;

    // Check if user has access to this key
    if (user.role !== UserRole.ADMIN && !user.allowedKeyIds.includes(keyId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this key',
        code: 'KEY_ACCESS_DENIED',
      });
    }

    const key = await tsigKeyService.getKey(keyId);

    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'Key not found',
        code: 'KEY_NOT_FOUND',
      });
    }

    // Remove the decrypted value before sending
    const { keyValue, ...keyWithoutValue } = key;

    res.json({
      success: true,
      key: keyWithoutValue,
    });
  } catch (error) {
    console.error('Get TSIG key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get TSIG key',
    });
  }
});

/**
 * PUT /api/tsig-keys/:keyId
 * Update a TSIG key (admin or editor only)
 */
router.put('/:keyId', requireAuth, requireWriteAccess, validateTSIGKeyUpdate, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { keyId } = req.params;

    // Check if user has access to this key
    if (user.role !== UserRole.ADMIN && !user.allowedKeyIds.includes(keyId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this key',
        code: 'KEY_ACCESS_DENIED',
      });
    }

    const updates: Partial<TSIGKeyCreate> = req.body;
    const key = await tsigKeyService.updateKey(keyId, updates);

    res.json({
      success: true,
      key,
    });
  } catch (error: any) {
    console.error('Update TSIG key error:', error);

    if (error.message === 'Key not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'KEY_NOT_FOUND',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update TSIG key',
    });
  }
});

/**
 * DELETE /api/tsig-keys/:keyId
 * Delete a TSIG key (admin only)
 */
router.delete('/:keyId', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;

    await tsigKeyService.deleteKey(keyId);

    res.json({
      success: true,
      message: 'Key deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete TSIG key error:', error);

    if (error.message === 'Key not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'KEY_NOT_FOUND',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete TSIG key',
    });
  }
});

export default router;
