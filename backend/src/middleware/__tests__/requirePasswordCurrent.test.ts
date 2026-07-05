// backend/src/middleware/__tests__/requirePasswordCurrent.test.ts
// Unit tests for the requirePasswordCurrent guard that blocks mutating actions
// while an account still owes a forced password change.
import { Request, Response } from 'express';
import { requirePasswordCurrent } from '../auth';
import { UserRole, AuthenticatedRequest } from '../../types/auth';

function makeRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
}

function makeReq(user?: AuthenticatedRequest['user']): Request {
  return { user } as unknown as Request;
}

describe('requirePasswordCurrent', () => {
  const baseUser = {
    userId: 'u1',
    username: 'admin',
    role: UserRole.ADMIN,
    allowedKeyIds: [],
    allowedZones: [],
  };

  it('rejects with 401 when the request is not authenticated', () => {
    const res = makeRes();
    const next = jest.fn();

    requirePasswordCurrent(makeReq(undefined), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect((res.body as { code: string }).code).toBe('NOT_AUTHENTICATED');
  });

  it('blocks with 403 PASSWORD_CHANGE_REQUIRED when the flag is set', () => {
    const res = makeRes();
    const next = jest.fn();

    requirePasswordCurrent(makeReq({ ...baseUser, mustChangePassword: true }), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect((res.body as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows the request when the flag is false', () => {
    const res = makeRes();
    const next = jest.fn();

    requirePasswordCurrent(makeReq({ ...baseUser, mustChangePassword: false }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows the request when the flag is absent (e.g. SSO users)', () => {
    const res = makeRes();
    const next = jest.fn();

    requirePasswordCurrent(makeReq({ ...baseUser }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
