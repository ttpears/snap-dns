// backend/src/routes/webhookConfigRoutes.ts
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { webhookConfigService } from '../services/webhookConfigService';

const router = Router();

/**
 * GET /api/webhook-config
 * Get webhook configuration for the authenticated user
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const config = await webhookConfigService.getConfig(user.userId);

    if (!config) {
      // Return default config if none exists
      return res.json({
        success: true,
        config: {
          webhookUrl: null,
          webhookProvider: null,
          enabled: false,
        },
      });
    }

    // Don't send userId back to client
    const { userId, ...configWithoutUserId } = config;

    res.json({
      success: true,
      config: configWithoutUserId,
    });
  } catch (error) {
    console.error('Get webhook config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook configuration',
    });
  }
});

/**
 * PUT /api/webhook-config
 * Update webhook configuration for the authenticated user
 */
router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { webhookUrl, webhookProvider, enabled } = req.body;

    // Validate webhook provider
    const validProviders = ['mattermost', 'slack', 'discord', 'teams', 'generic', null];
    if (webhookProvider !== undefined && !validProviders.includes(webhookProvider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook provider',
        code: 'INVALID_PROVIDER',
      });
    }

    // If webhookUrl is provided, validate it's a valid URL
    if (webhookUrl && typeof webhookUrl === 'string') {
      try {
        new URL(webhookUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook URL',
          code: 'INVALID_URL',
        });
      }
    }

    const config = await webhookConfigService.setConfig(
      user.userId,
      webhookUrl !== undefined ? webhookUrl : null,
      webhookProvider !== undefined ? webhookProvider : null,
      enabled !== undefined ? enabled : true
    );

    // Don't send userId back to client
    const { userId, ...configWithoutUserId } = config;

    res.json({
      success: true,
      config: configWithoutUserId,
    });
  } catch (error) {
    console.error('Update webhook config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update webhook configuration',
    });
  }
});

/**
 * DELETE /api/webhook-config
 * Delete webhook configuration for the authenticated user
 */
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    await webhookConfigService.deleteConfig(user.userId);

    res.json({
      success: true,
      message: 'Webhook configuration deleted',
    });
  } catch (error) {
    console.error('Delete webhook config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete webhook configuration',
    });
  }
});

/**
 * GET /api/webhook-config/all
 * Get all webhook configurations (admin only)
 */
router.get('/all', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const configs = await webhookConfigService.getAllConfigs();

    res.json({
      success: true,
      configs,
    });
  } catch (error) {
    console.error('Get all webhook configs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook configurations',
    });
  }
});

export default router;
