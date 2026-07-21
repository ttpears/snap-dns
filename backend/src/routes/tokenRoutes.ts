// backend/src/routes/tokenRoutes.ts
// Personal API token endpoints.
//
// POST and DELETE are SESSION-ONLY (requireSessionAuth) so a bearer token can
// never mint or manage tokens. GET accepts either a session or a bearer token
// (read-only metadata of the caller's own tokens). The raw token is returned
// exactly once by POST and is never logged or persisted in plaintext.

import { Router, Request, Response } from 'express';
import { requireAuth, requireSessionAuth, requirePasswordCurrent } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { apiTokenService } from '../services/apiTokenService';
import { tokenLimiter } from '../middleware/rateLimiter';
import { validateTokenCreate } from '../middleware/validation';
import { auditService, AuditEventType } from '../services/auditService';

const router = Router();

// Apply rate limiting to all token routes
router.use(tokenLimiter);

/**
 * POST /api/tokens
 * Create a personal API token (session only). Returns the raw token ONCE.
 */
// requirePasswordCurrent: minting a long-lived credential is a mutation and must
// obey the same forced-rotation gate as every other mutating route, so a
// not-yet-rotated account cannot create a token that outlives the rotation.
router.post('/', requireAuth, requireSessionAuth, requirePasswordCurrent, validateTokenCreate, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { name, expiresInDays } = req.body;

    const { raw, record } = await apiTokenService.createToken(user.userId, name, expiresInDays);

    // Audit creation with identifying metadata only — never the raw token/hash.
    await auditService.log(AuditEventType.TOKEN_CREATED, {
      userId: user.userId,
      username: user.username,
      success: true,
      details: { tokenId: record.id, name: record.name },
    });

    res.status(201).json({
      success: true,
      token: raw,
      id: record.id,
      name: record.name,
      prefix: record.tokenPrefix,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  } catch (error: any) {
    console.error('Create API token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create token',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * GET /api/tokens
 * List the caller's own, non-revoked tokens (session OR bearer). Metadata only.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const tokens = await apiTokenService.listTokensForUser(user.userId);
    res.json({ success: true, tokens });
  } catch (error) {
    console.error('List API tokens error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tokens',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * DELETE /api/tokens/:id
 * Revoke one of the caller's own tokens (session only).
 */
router.delete('/:id', requireAuth, requireSessionAuth, requirePasswordCurrent, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const ok = await apiTokenService.revokeToken(user.userId, req.params.id);
    if (!ok) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND',
      });
    }

    await auditService.log(AuditEventType.TOKEN_REVOKED, {
      userId: user.userId,
      username: user.username,
      success: true,
      details: { tokenId: req.params.id },
    });

    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    console.error('Revoke API token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke token',
      code: 'SERVER_ERROR',
    });
  }
});

export default router;
