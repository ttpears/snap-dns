// backend/src/routes/auditRoutes.ts
// API routes for audit log viewing

import { Router, Request, Response } from 'express';
import { auditService, AuditEventType } from '../services/auditService';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// All audit routes require authentication
router.use(requireAuth);

/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags:
 *       - Audit
 *     summary: Get Audit Logs
 *     description: Query audit logs with optional filters (admin only)
 *     security:
 *       - BearerAuth: []
 *       - SessionAuth: []
 *     parameters:
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *           enum: [auth.login.success, auth.login.failure, auth.logout, user.created, user.deleted, apikey.created, apikey.deleted, apikey.rotated, dns.record.added, dns.record.deleted]
 *         description: Filter by event type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries before this date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 1000
 *           maximum: 10000
 *         description: Maximum number of entries to return
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *       403:
 *         description: Not admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Only admins can view audit logs
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can view audit logs',
      });
    }

    // Parse query parameters
    const {
      eventType,
      userId,
      startDate,
      endDate,
      limit = '1000',
    } = req.query;

    // Build filters object
    const filters: any = {};

    if (eventType && typeof eventType === 'string') {
      // Validate event type
      if (Object.values(AuditEventType).includes(eventType as AuditEventType)) {
        filters.eventType = eventType as AuditEventType;
      }
    }

    if (userId && typeof userId === 'string') {
      filters.userId = userId;
    }

    if (startDate && typeof startDate === 'string') {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        filters.startDate = date;
      }
    }

    if (endDate && typeof endDate === 'string') {
      const date = new Date(endDate);
      if (!isNaN(date.getTime())) {
        filters.endDate = date;
      }
    }

    if (limit) {
      const limitNum = parseInt(limit as string, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        filters.limit = Math.min(limitNum, 10000); // Cap at 10k
      }
    }

    // Query audit logs
    const entries = await auditService.query(filters);

    res.json({
      success: true,
      entries,
      count: entries.length,
    });
  } catch (error: any) {
    console.error('Error querying audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to query audit logs',
    });
  }
});

/**
 * GET /api/audit/event-types
 * Get list of all available event types
 * Requires: Admin role
 */
router.get('/event-types', (req: Request, res: Response) => {
  try {
    // Only admins can view audit logs
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can view audit logs',
      });
    }

    // Group event types by category
    const eventTypes = {
      authentication: [
        AuditEventType.LOGIN_SUCCESS,
        AuditEventType.LOGIN_FAILURE,
        AuditEventType.LOGOUT,
        AuditEventType.PASSWORD_CHANGE,
        AuditEventType.PASSWORD_RESET,
      ],
      userManagement: [
        AuditEventType.USER_CREATED,
        AuditEventType.USER_DELETED,
        AuditEventType.USER_UPDATED,
      ],
      tsigKeys: [
        AuditEventType.KEY_CREATED,
        AuditEventType.KEY_UPDATED,
        AuditEventType.KEY_DELETED,
        AuditEventType.KEY_ACCESSED,
      ],
      dns: [
        AuditEventType.RECORD_ADDED,
        AuditEventType.RECORD_DELETED,
        AuditEventType.RECORD_UPDATED,
        AuditEventType.ZONE_QUERIED,
      ],
      security: [
        AuditEventType.UNAUTHORIZED_ACCESS,
        AuditEventType.VALIDATION_FAILURE,
        AuditEventType.RATE_LIMIT_EXCEEDED,
      ],
    };

    res.json({
      success: true,
      eventTypes,
    });
  } catch (error: any) {
    console.error('Error getting event types:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get event types',
    });
  }
});

export default router;
