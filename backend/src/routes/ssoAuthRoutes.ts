// backend/src/routes/ssoAuthRoutes.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { msalService } from '../services/msalService';
import { ssoConfigService } from '../services/ssoConfigService';
import { userService } from '../services/userService';
import { auditService, AuditEventType } from '../services/auditService';
import { UserRole } from '../types/auth';

const router = Router();

// Store for CSRF state tokens (in production, use Redis)
const stateStore = new Map<string, { timestamp: number; redirectUri: string }>();

// Clean up old state tokens every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of stateStore.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      stateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * GET /api/auth/sso/signin
 * Initiate SSO sign-in flow
 */
router.get('/signin', async (req: Request, res: Response) => {
  try {
    // Check if SSO is enabled
    const ssoConfig = await ssoConfigService.getFullConfig();

    if (!ssoConfig?.enabled) {
      console.log('SSO sign-in attempted but SSO is disabled');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=sso_disabled`);
    }

    const redirectUri = ssoConfig.redirectUri || `${req.protocol}://${req.get('host')}/api/auth/sso/callback`;

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, {
      timestamp: Date.now(),
      redirectUri: redirectUri
    });

    console.log(`SSO sign-in initiated, redirect URI: ${redirectUri}`);

    // Get authorization URL from MSAL
    const authUrl = await msalService.getAuthCodeUrl(state, redirectUri);

    // Redirect user to Microsoft login
    res.redirect(authUrl);
  } catch (error) {
    console.error('SSO sign-in error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/login?error=sso_init_failed`);
  }
});

/**
 * GET/POST /api/auth/sso/callback
 * Handle OAuth callback from Entra ID
 */
const handleCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.method === 'POST' ? req.body : req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      await auditService.log(AuditEventType.LOGIN_FAILURE, {
        username: 'unknown',
        success: false,
        ipAddress: req.ip,
        error: `SSO OAuth error: ${error}`,
      });
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }

    // Validate state token (CSRF protection)
    if (!state || !stateStore.has(state)) {
      console.error('Invalid or missing state token');
      await auditService.log(AuditEventType.UNAUTHORIZED_ACCESS, {
        username: 'unknown',
        success: false,
        ipAddress: req.ip,
        error: 'Invalid state token',
      });
      return res.redirect(`${frontendUrl}/login?error=invalid_state`);
    }

    const stateData = stateStore.get(state)!;
    stateStore.delete(state);

    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }

    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...');
    const tokenResponse = await msalService.acquireTokenByCode(code, stateData.redirectUri);

    // Decode and validate ID token
    const claims = msalService.decodeIdToken(tokenResponse.idToken!);
    console.log('User authenticated:', claims.preferred_username || claims.email);

    // Provision or update user (JIT provisioning)
    const userId = `entra_${claims.oid}`;
    let user = await userService.getUserById(userId);

    if (user) {
      // Update existing user
      user.lastLogin = new Date();
      console.log(`Existing SSO user logged in: ${user.username}`);
    } else {
      // Create new user (JIT provisioning)
      const username = claims.preferred_username || claims.email || claims.upn;
      const email = claims.email || claims.preferred_username;

      // Determine role from claims (app roles or default to viewer)
      let role = UserRole.VIEWER;
      if (claims.roles && Array.isArray(claims.roles)) {
        if (claims.roles.includes('admin')) {
          role = UserRole.ADMIN;
        } else if (claims.roles.includes('editor')) {
          role = UserRole.EDITOR;
        }
      }

      // Create new user (JIT provisioning)
      const newUser = {
        id: userId,
        username: username,
        passwordHash: '', // SSO users don't have local passwords
        role: role,
        email: email,
        createdAt: new Date(),
        lastLogin: new Date(),
        allowedKeyIds: [], // Start with no keys, admin assigns later
      };

      user = await userService.createOrUpdateSSOUser(newUser);
      console.log(`New SSO user provisioned: ${user.username} (${user.role})`);

      await auditService.log(AuditEventType.USER_CREATED, {
        userId: user.id,
        username: user.username,
        success: true,
        ipAddress: req.ip,
        details: {
          method: 'sso_jit_provisioning',
          provider: 'm365',
          role: user.role,
        },
      });
    }

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.allowedKeyIds = user.allowedKeyIds;

    // Log successful login
    await auditService.log(AuditEventType.LOGIN_SUCCESS, {
      userId: user.id,
      username: user.username,
      success: true,
      ipAddress: req.ip,
      details: { method: 'sso_m365' },
    });

    console.log(`SSO login successful: ${user.username} (${user.role})`);

    // Redirect to app
    res.redirect(frontendUrl);
  } catch (error) {
    console.error('SSO callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    await auditService.log(AuditEventType.LOGIN_FAILURE, {
      username: 'unknown',
      success: false,
      ipAddress: req.ip,
      error: error instanceof Error ? error.message : 'SSO callback failed',
    });

    res.redirect(`${frontendUrl}/login?error=callback_failed`);
  }
};

router.get('/callback', handleCallback);
router.post('/callback', handleCallback);

/**
 * GET /api/auth/sso/signout
 * Sign out from SSO
 */
router.get('/signout', async (req: Request, res: Response) => {
  const username = req.session.username;
  const userId = req.session.userId;

  // Log logout
  if (username) {
    await auditService.log(AuditEventType.LOGOUT, {
      userId: userId,
      username: username!,
      success: true,
      ipAddress: req.ip,
      details: { method: 'sso_m365' },
    });
  }

  // Destroy local session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });

  console.log(`SSO logout: ${username}`);

  try {
    // Get M365 logout URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const logoutUrl = await msalService.getLogoutUrl(`${frontendUrl}/login`);

    // Redirect to Entra logout
    res.redirect(logoutUrl);
  } catch (error) {
    console.error('SSO logout error:', error);
    // Fallback to frontend if logout URL fails
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/login`);
  }
});

export default router;
