// backend/src/routes/authRoutes.ts
import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { userService } from '../services/userService';
import { auditService, AuditEventType } from '../services/auditService';
import { requireAuth, requireRole } from '../middleware/auth';
import { LoginCredentials, UserCreateData, UserRole, AuthenticatedRequest } from '../types/auth';
import { validateLogin, validateUserCreate, validateChangePassword } from '../middleware/validation';

const router = Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', loginLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginCredentials = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Authenticate user
    const user = await userService.authenticate(username, password);

    if (!user) {
      // Log failed login attempt
      await auditService.logAuth(
        AuditEventType.LOGIN_FAILURE,
        username,
        undefined,
        req.ip,
        false,
        'Invalid credentials'
      );

      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.allowedKeyIds = user.allowedKeyIds;

    // Log successful login
    await auditService.logAuth(
      AuditEventType.LOGIN_SUCCESS,
      user.username,
      user.id,
      req.ip,
      true
    );

    console.log(`User logged in: ${user.username} (${user.role})`);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        allowedKeyIds: user.allowedKeyIds
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/auth/logout
 * Destroy session
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const username = req.session.username;
  const userId = req.session.userId;

  // Log logout
  await auditService.logAuth(
    AuditEventType.LOGOUT,
    username!,
    userId,
    req.ip,
    true
  );

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to logout',
        code: 'LOGOUT_ERROR'
      });
    }

    console.log(`User logged out: ${username}`);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

/**
 * GET /api/auth/session
 * Check if user is authenticated and get session info
 */
router.get('/session', (req: Request, res: Response) => {
  if (!req.session || !req.session.userId) {
    return res.json({
      authenticated: false
    });
  }

  res.json({
    authenticated: true,
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      allowedKeyIds: req.session.allowedKeyIds
    }
  });
});

/**
 * POST /api/auth/change-password
 * Change user's own password
 */
router.post('/change-password', requireAuth, validateChangePassword, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    // Verify current password
    const user = await userService.getUserById(authReq.user!.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const authenticated = await userService.authenticate(user.username, currentPassword);
    if (!authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Update password
    await userService.updatePassword(user.id, newPassword);

    // Log password change
    await auditService.log(AuditEventType.PASSWORD_CHANGE, {
      userId: user.id,
      username: user.username,
      success: true,
    });

    console.log(`Password changed for user: ${user.username}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/auth/users
 * Create a new user (admin only)
 */
router.post('/users', requireAuth, requireRole(UserRole.ADMIN), validateUserCreate, async (req: Request, res: Response) => {
  try {
    const userData: UserCreateData = req.body;

    if (!userData.username || !userData.password || !userData.role) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and role are required',
        code: 'MISSING_FIELDS'
      });
    }

    if (userData.password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    const user = await userService.createUser(userData);

    // Log user creation
    await auditService.log(AuditEventType.USER_CREATED, {
      userId: req.session.userId,
      username: req.session.username,
      success: true,
      details: {
        createdUserId: user.id,
        createdUsername: user.username,
        role: user.role,
      },
    });

    console.log(`User created: ${user.username} by ${req.session.username}`);

    res.status(201).json({
      success: true,
      user
    });
  } catch (error: any) {
    console.error('Create user error:', error);

    if (error.message === 'Username already exists') {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: 'USERNAME_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create user',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/auth/users
 * List all users (admin only)
 */
router.get('/users', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const users = await userService.listUsers();
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list users',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * DELETE /api/auth/users/:userId
 * Delete a user (admin only)
 */
router.delete('/users/:userId', requireAuth, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const authReq = req as AuthenticatedRequest;

    // Prevent deleting yourself
    if (userId === authReq.user!.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    // Get user info before deleting
    const userToDelete = await userService.getUserById(userId);

    await userService.deleteUser(userId);

    // Log user deletion
    await auditService.log(AuditEventType.USER_DELETED, {
      userId: req.session.userId,
      username: req.session.username,
      success: true,
      details: {
        deletedUserId: userId,
        deletedUsername: userToDelete?.username,
      },
    });

    console.log(`User deleted: ${userId} by ${req.session.username}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete user error:', error);

    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'USER_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      code: 'SERVER_ERROR'
    });
  }
});

export default router;
