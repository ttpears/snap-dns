// backend/src/services/__tests__/userService.mustChangePassword.test.ts
// Verifies the forced-password-change lifecycle on userService:
// - the seeded default admin is created with mustChangePassword = true
// - admin-created users are forced to change their initial password
// - updatePassword clears the flag by default (self-service change)
// - updatePassword can force a change (admin resetting another user)
// fs.promises is mocked so the service never touches disk; the rest of fs
// (e.g. existsSync, used by bcrypt's native-binding loader) stays real, and
// bcrypt itself runs for real.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      // ENOENT drives initialize() down the "create default admin" path.
      readFile: jest.fn().mockRejectedValue({ code: 'ENOENT' }),
      writeFile: jest.fn().mockResolvedValue(undefined),
    },
  };
});

import { userService } from '../userService';
import { UserRole } from '../../types/auth';

describe('userService mustChangePassword lifecycle', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(jest.fn());
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('seeds the default admin with mustChangePassword = true', async () => {
    await userService.initialize();

    const admin = await userService.getUserByUsername('admin');
    expect(admin).not.toBeNull();
    expect(admin!.mustChangePassword).toBe(true);
  });

  it('clears the flag when the password is changed by the user (default)', async () => {
    await userService.initialize();
    const admin = await userService.getUserByUsername('admin');

    await userService.updatePassword(admin!.id, 'a-new-strong-password');

    const updated = await userService.getUserById(admin!.id);
    expect(updated!.mustChangePassword).toBe(false);
  });

  it('forces a change for admin-created users, and can be cleared', async () => {
    await userService.initialize();

    const created = await userService.createUser({
      username: 'editor1',
      password: 'initial-password',
      role: UserRole.EDITOR,
    });

    const stored = await userService.getUserById(created.id);
    expect(stored!.mustChangePassword).toBe(true);

    // Admin resetting ANOTHER user's password forces a change (true).
    await userService.updatePassword(created.id, 'admin-set-temp-pass', true);
    expect((await userService.getUserById(created.id))!.mustChangePassword).toBe(true);

    // The user then changes it themselves, clearing the flag.
    await userService.updatePassword(created.id, 'user-chosen-pass');
    expect((await userService.getUserById(created.id))!.mustChangePassword).toBe(false);
  });
});
