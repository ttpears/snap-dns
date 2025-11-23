// backend/src/routes/backupRoutes.ts
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { backupService } from '../services/backupService';

const router = Router();

/**
 * GET /api/backups
 * List all backups (across all zones) for the authenticated user
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const backups = await backupService.getAllBackups(user.userId, user.role);

    res.json({
      success: true,
      backups,
    });
  } catch (error) {
    console.error('List all backups error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list backups',
    });
  }
});

/**
 * GET /api/backups/zone/:zone
 * List backups for a specific zone
 */
router.get('/zone/:zone', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;

    const backups = await backupService.getBackupsForZone(zone, user.userId, user.role);

    res.json({
      success: true,
      backups,
    });
  } catch (error) {
    console.error(`List backups for zone ${req.params.zone} error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list backups for zone',
    });
  }
});

/**
 * GET /api/backups/zone/:zone/:backupId
 * Get a specific backup (with full records)
 */
router.get('/zone/:zone/:backupId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone, backupId } = req.params;

    const backup = await backupService.getBackup(zone, backupId, user.userId, user.role);

    if (!backup) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found',
        code: 'BACKUP_NOT_FOUND',
      });
    }

    res.json({
      success: true,
      backup,
    });
  } catch (error: any) {
    console.error(`Get backup ${req.params.backupId} error:`, error);

    if (error.message === 'Access denied to this backup') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: 'ACCESS_DENIED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get backup',
    });
  }
});

/**
 * POST /api/backups/zone/:zone
 * Create a new backup for a zone
 */
router.post('/zone/:zone', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { records, server, type, description } = req.body;

    // Validate required fields
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        error: 'Records array is required',
        code: 'MISSING_RECORDS',
      });
    }

    if (!server) {
      return res.status(400).json({
        success: false,
        error: 'Server is required',
        code: 'MISSING_SERVER',
      });
    }

    if (!type || (type !== 'auto' && type !== 'manual')) {
      return res.status(400).json({
        success: false,
        error: 'Type must be either "auto" or "manual"',
        code: 'INVALID_TYPE',
      });
    }

    const backup = await backupService.createBackup(zone, records, user.userId, {
      server,
      type,
      description,
    });

    res.status(201).json({
      success: true,
      backup,
    });
  } catch (error) {
    console.error(`Create backup for zone ${req.params.zone} error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create backup',
    });
  }
});

/**
 * DELETE /api/backups/zone/:zone/:backupId
 * Delete a backup
 */
router.delete('/zone/:zone/:backupId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone, backupId } = req.params;

    await backupService.deleteBackup(zone, backupId, user.userId, user.role);

    res.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    console.error(`Delete backup ${req.params.backupId} error:`, error);

    if (error.message === 'Backup not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'BACKUP_NOT_FOUND',
      });
    }

    if (error.message === 'Access denied to delete this backup') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: 'ACCESS_DENIED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete backup',
    });
  }
});

export default router;
