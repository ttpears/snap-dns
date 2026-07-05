// backend/src/middleware/__tests__/auth.test.ts
import { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole, requireWriteAccess } from '../auth';
import { AuthenticatedRequest, User, UserRole } from '../../types/auth';
import { userService } from '../../services/userService';

jest.mock('../../services/userService', () => ({
  userService: {
    getUserById: jest.fn(),
  },
}));

const mockGetUserById = userService.getUserById as jest.MockedFunction<typeof userService.getUserById>;

type SessionLike = {
  userId?: string;
  username?: string;
  role?: UserRole;
  allowedKeyIds?: string[];
  allowedZones?: string[];
  destroy?: (cb: (err?: unknown) => void) => void;
};

interface MockRes {
  statusCode?: number;
  body?: unknown;
  status: jest.Mock;
  json: jest.Mock;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    username: 'alice',
    passwordHash: 'hash',
    role: UserRole.ADMIN,
    createdAt: new Date(),
    allowedKeyIds: ['key-a', 'key-b'],
    allowedZones: ['example.com'],
    ...overrides,
  };
}

function makeReq(session: SessionLike | undefined): Request {
  return { session } as unknown as Request;
}

function makeRes(): Response & MockRes {
  const res = {} as Response & MockRes;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
}

function userOf(req: Request) {
  return (req as AuthenticatedRequest).user;
}

describe('requireAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects with 401 when there is no session', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(next).not.toHaveBeenCalled();
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the session has no userId', async () => {
    const req = makeReq({ username: 'alice' });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('populates req.user from fresh DB values, keeping identity from the session', async () => {
    mockGetUserById.mockResolvedValue(
      makeUser({ role: UserRole.EDITOR, allowedKeyIds: ['key-x'], allowedZones: ['db.zone'] })
    );
    const req = makeReq({
      userId: 'user_1',
      username: 'alice',
      // Stale session values that must be ignored:
      role: UserRole.ADMIN,
      allowedKeyIds: ['stale-key'],
      allowedZones: ['stale.zone'],
    });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(mockGetUserById).toHaveBeenCalledWith('user_1');
    const user = userOf(req);
    expect(user).toBeDefined();
    expect(user?.userId).toBe('user_1');
    expect(user?.username).toBe('alice');
    expect(user?.role).toBe(UserRole.EDITOR);
    expect(user?.allowedKeyIds).toEqual(['key-x']);
    expect(user?.allowedZones).toEqual(['db.zone']);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reflects a role change on the next request without re-login', async () => {
    // User logged in as admin (session role), but has since been demoted to viewer.
    mockGetUserById.mockResolvedValue(makeUser({ role: UserRole.VIEWER }));
    const req = makeReq({ userId: 'user_1', username: 'alice', role: UserRole.ADMIN });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(userOf(req)?.role).toBe(UserRole.VIEWER);

    // Downstream authorization now sees the fresh viewer role.
    const writeRes = makeRes();
    const writeNext = jest.fn() as NextFunction;
    requireWriteAccess(req, writeRes, writeNext);
    expect(writeRes.status).toHaveBeenCalledWith(403);
    expect(writeRes.body).toMatchObject({ code: 'READ_ONLY' });
    expect(writeNext).not.toHaveBeenCalled();

    const roleRes = makeRes();
    const roleNext = jest.fn() as NextFunction;
    requireRole(UserRole.ADMIN)(req, roleRes, roleNext);
    expect(roleRes.status).toHaveBeenCalledWith(403);
    expect(roleRes.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(roleNext).not.toHaveBeenCalled();
  });

  it('reflects an allowedKeyIds revocation on the next request', async () => {
    mockGetUserById.mockResolvedValue(
      makeUser({ role: UserRole.EDITOR, allowedKeyIds: [] })
    );
    const req = makeReq({
      userId: 'user_1',
      username: 'alice',
      role: UserRole.EDITOR,
      allowedKeyIds: ['key-a', 'key-b'],
    });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(userOf(req)?.allowedKeyIds).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('destroys the session and returns 401 when the user no longer exists', async () => {
    mockGetUserById.mockResolvedValue(null);
    const destroy = jest.fn((cb: (err?: unknown) => void) => cb());
    const req = makeReq({ userId: 'deleted_user', username: 'ghost', destroy });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(next).not.toHaveBeenCalled();
    expect(userOf(req)).toBeUndefined();
  });

  it('defaults allowedZones to an empty array when the stored user has none', async () => {
    mockGetUserById.mockResolvedValue(
      makeUser({ allowedZones: undefined as unknown as string[] })
    );
    const req = makeReq({ userId: 'user_1', username: 'alice' });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(userOf(req)?.allowedZones).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('forwards unexpected lookup errors to next', async () => {
    const boom = new Error('store failure');
    mockGetUserById.mockRejectedValue(boom);
    const req = makeReq({ userId: 'user_1', username: 'alice' });
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('rejects with 401 when req.user is missing', () => {
    const req = {} as Request;
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireRole(UserRole.ADMIN)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a user whose role is in the allowed set', () => {
    const req = {} as AuthenticatedRequest;
    req.user = {
      userId: 'user_1',
      username: 'alice',
      role: UserRole.ADMIN,
      allowedKeyIds: [],
      allowedZones: [],
    };
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireRole(UserRole.ADMIN, UserRole.EDITOR)(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireWriteAccess', () => {
  it('rejects viewers with 403 READ_ONLY', () => {
    const req = {} as AuthenticatedRequest;
    req.user = {
      userId: 'user_1',
      username: 'alice',
      role: UserRole.VIEWER,
      allowedKeyIds: [],
      allowedZones: [],
    };
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireWriteAccess(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ code: 'READ_ONLY' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows editors to proceed', () => {
    const req = {} as AuthenticatedRequest;
    req.user = {
      userId: 'user_1',
      username: 'alice',
      role: UserRole.EDITOR,
      allowedKeyIds: [],
      allowedZones: [],
    };
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireWriteAccess(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
