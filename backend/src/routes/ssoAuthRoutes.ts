// backend/src/routes/ssoAuthRoutes.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { msalService } from '../services/msalService';
import { ssoConfigService } from '../services/ssoConfigService';
import { userService } from '../services/userService';
import { auditService, AuditEventType } from '../services/auditService';
import { UserRole } from '../types/auth';
import { getClientIp } from '../helpers/ipHelpers';
import { regenerateSession } from '../helpers/session';
import { putState, consumeState, SSOStateError } from '../services/ssoStateStore';

const router = Router();

// Frontend base URL for post-SSO redirects.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

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
      return res.redirect(`${FRONTEND_URL}/login?error=sso_disabled`);
    }

    const redirectUri = ssoConfig.redirectUri || `${req.protocol}://${req.get('host')}/api/auth/sso/callback`;

    // Generate a CSRF state token and a replay-defending nonce, and stash both
    // on the browser session (survives restarts / multi-instance; scoped to the
    // session rather than a process-global map).
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    putState(req.session, {
      state,
      nonce,
      redirectUri,
      timestamp: Date.now(),
    });

    console.log(`SSO sign-in initiated, redirect URI: ${redirectUri}`);

    // Get authorization URL from MSAL (nonce is embedded in the returned id_token)
    const authUrl = await msalService.getAuthCodeUrl(state, redirectUri, nonce);

    // Redirect user to Microsoft login
    res.redirect(authUrl);
  } catch (error) {
    console.error('SSO sign-in error:', error);
    const frontendUrl = FRONTEND_URL;
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
    const frontendUrl = FRONTEND_URL;

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      await auditService.log(AuditEventType.LOGIN_FAILURE, {
        username: 'unknown',
        success: false,
        ipAddress: getClientIp(req),
        error: `SSO OAuth error: ${error}`,
      });
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }

    // Validate and consume the state token (CSRF protection + single-use). The
    // pending value is scoped to this browser session and burned on first use.
    let stateData;
    try {
      stateData = consumeState(req.session, state);
    } catch (err) {
      const code = err instanceof SSOStateError ? err.code : 'UNKNOWN';
      console.error(`Invalid SSO state token (${code})`);
      await auditService.log(AuditEventType.UNAUTHORIZED_ACCESS, {
        username: 'unknown',
        success: false,
        ipAddress: getClientIp(req),
        error: `Invalid state token: ${code}`,
      });
      return res.redirect(`${frontendUrl}/login?error=invalid_state`);
    }

    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }

    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...');
    const tokenResponse = await msalService.acquireTokenByCode(code, stateData.redirectUri);

    // Use MSAL's validated id_token claims, asserting issuer/audience/expiry and
    // the nonce we issued at /signin before trusting them to create a session.
    const claims = await msalService.getValidatedIdTokenClaims(tokenResponse, stateData.nonce);

    // A stable subject (oid) and a resolvable username are required to identify
    // the user; a token without them is not usable for provisioning.
    const resolvedUsername = claims.preferred_username || claims.email || claims.upn;
    if (!claims.oid || !resolvedUsername) {
      console.error('ID token missing required identity claims (oid/username)');
      return res.redirect(`${frontendUrl}/login?error=invalid_token`);
    }
    console.log('User authenticated:', resolvedUsername);

    // Provision or update user (JIT provisioning)
    const userId = `entra_${claims.oid}`;
    let user = await userService.getUserById(userId);

    if (user) {
      // Update existing user
      user.lastLogin = new Date();
      console.log(`Existing SSO user logged in: ${user.username}`);
    } else {
      // Create new user (JIT provisioning)
      const username = resolvedUsername;
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
        allowedZones: [],
      };

      user = await userService.createOrUpdateSSOUser(newUser);
      console.log(`New SSO user provisioned: ${user.username} (${user.role})`);

      await auditService.log(AuditEventType.USER_CREATED, {
        userId: user.id,
        username: user.username,
        success: true,
        ipAddress: getClientIp(req),
        details: {
          method: 'sso_jit_provisioning',
          provider: 'm365',
          role: user.role,
        },
      });
    }

    // Regenerate the session id before populating authenticated fields so the
    // pre-auth session id is discarded (session fixation mitigation). The
    // post-login redirect below is preserved.
    await regenerateSession(req.session);

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.allowedKeyIds = user.allowedKeyIds;
    req.session.allowedZones = user.allowedZones || [];

    // Log successful login
    await auditService.log(AuditEventType.LOGIN_SUCCESS, {
      userId: user.id,
      username: user.username,
      success: true,
      ipAddress: getClientIp(req),
      details: { method: 'sso_m365' },
    });

    console.log(`SSO login successful: ${user.username} (${user.role})`);

    // Redirect to app
    res.redirect(frontendUrl);
  } catch (error) {
    console.error('SSO callback error:', error);
    const frontendUrl = FRONTEND_URL;

    await auditService.log(AuditEventType.LOGIN_FAILURE, {
      username: 'unknown',
      success: false,
      ipAddress: getClientIp(req),
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
      ipAddress: getClientIp(req),
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
    const frontendUrl = FRONTEND_URL;
    const logoutUrl = await msalService.getLogoutUrl(`${frontendUrl}/login`);

    // Redirect to Entra logout
    res.redirect(logoutUrl);
  } catch (error) {
    console.error('SSO logout error:', error);
    // Fallback to frontend if logout URL fails
    const frontendUrl = FRONTEND_URL;
    res.redirect(`${frontendUrl}/login`);
  }
});

export default router;
