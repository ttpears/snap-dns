// backend/src/routes/ssoConfigRoutes.ts
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserRole } from '../types/auth';
import { ssoConfigService } from '../services/ssoConfigService';
import { SSOConfig, SSOProvider } from '../types/sso';
import { auditService, AuditEventType } from '../services/auditService';

const router = Router();

/**
 * GET /api/sso-config
 * Get SSO configuration (admin only)
 */
router.get('/', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const config = await ssoConfigService.getConfig();
    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Get SSO config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get SSO configuration',
    });
  }
});

/**
 * PUT /api/sso-config
 * Update SSO configuration (admin only)
 */
router.put('/', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const updates: Partial<SSOConfig> = req.body;

    // Validate provider if specified
    if (updates.provider && !Object.values(SSOProvider).includes(updates.provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid SSO provider',
        code: 'INVALID_PROVIDER',
      });
    }

    // If enabling M365, validate required fields
    if (updates.enabled && updates.provider === SSOProvider.M365) {
      const required = ['clientId', 'tenantId', 'redirectUri'];
      const missing = required.filter(field => {
        const key = field as keyof SSOConfig;
        return !updates[key];
      });

      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required M365 fields: ${missing.join(', ')}`,
          code: 'MISSING_FIELDS',
        });
      }
    }

    await ssoConfigService.updateConfig(updates);

    // Log configuration change
    await auditService.log(AuditEventType.USER_UPDATED, {
      userId: req.session.userId,
      username: req.session.username,
      success: true,
      details: {
        action: 'sso_config_updated',
        enabled: updates.enabled,
        provider: updates.provider,
      },
    });

    console.log(`SSO config updated by ${req.session.username}`);

    res.json({
      success: true,
      message: 'SSO configuration updated successfully',
    });
  } catch (error) {
    console.error('Update SSO config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update SSO configuration',
    });
  }
});

/**
 * POST /api/sso-config/test
 * Test SSO configuration (admin only)
 */
router.post('/test', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const config = await ssoConfigService.getFullConfig();

    if (!config?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'SSO is not enabled',
        code: 'SSO_DISABLED',
      });
    }

    if (config.provider === SSOProvider.M365) {
      // Basic validation for M365
      const issues: string[] = [];

      if (!config.clientId || config.clientId.length < 10) {
        issues.push('Invalid Client ID format');
      }
      if (!config.tenantId || config.tenantId.length < 10) {
        issues.push('Invalid Tenant ID format');
      }
      if (!config.redirectUri || !config.redirectUri.startsWith('http')) {
        issues.push('Invalid Redirect URI format');
      }

      if (issues.length > 0) {
        return res.json({
          success: false,
          errors: issues,
          message: 'SSO configuration has validation errors',
        });
      }

      return res.json({
        success: true,
        message: 'SSO configuration appears valid',
        note: 'Full authentication test requires actual login flow',
      });
    }

    res.json({
      success: true,
      message: 'SSO configuration loaded',
    });
  } catch (error) {
    console.error('Test SSO config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test SSO configuration',
    });
  }
});

export default router;
