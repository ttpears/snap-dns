// backend/src/services/__tests__/userService.timing.test.ts
// Verifies that authenticate() is constant-time with respect to username
// existence: an unknown username must still perform a bcrypt comparison (against
// a dummy hash) rather than returning early, so login timing cannot be used to
// enumerate valid usernames. Also confirms the known-user paths still behave.
import bcrypt from 'bcrypt';
import { userService } from '../userService';
import { User, UserRole } from '../../types/auth';

describe('userService.authenticate timing safety', () => {
  const KNOWN_USERNAME = 'alice';
  const KNOWN_PASSWORD = 'correct horse battery staple';
  let knownUser: User;

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(jest.fn());
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());

    // Avoid touching disk / triggering the default-admin bootstrap.
    jest
      .spyOn(userService as unknown as { initialize: () => Promise<void> }, 'initialize')
      .mockResolvedValue(undefined);
    jest
      .spyOn(userService as unknown as { saveUsers: () => Promise<void> }, 'saveUsers')
      .mockResolvedValue(undefined);

    // Mark as initialized and seed a single known user directly into the map.
    (userService as unknown as { initialized: boolean }).initialized = true;
    const users: Map<string, User> = (userService as unknown as { users: Map<string, User> }).users;
    users.clear();
    knownUser = {
      id: 'user_test_1',
      username: KNOWN_USERNAME,
      passwordHash: await bcrypt.hash(KNOWN_PASSWORD, 12),
      role: UserRole.ADMIN,
      email: 'alice@localhost',
      createdAt: new Date(),
      allowedKeyIds: [],
      allowedZones: [],
    };
    users.set(knownUser.id, knownUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (userService as unknown as { users: Map<string, User> }).users.clear();
    (userService as unknown as { initialized: boolean }).initialized = false;
  });

  it('performs a bcrypt comparison for an unknown username (no early return)', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    const result = await userService.authenticate('does-not-exist', 'whatever');

    // Unknown username fails, identically to a wrong password.
    expect(result).toBeNull();
    // The oracle-closing property: a bcrypt comparison ran even though the user
    // was not found, so this path is not a trivially-early return.
    expect(compareSpy).toHaveBeenCalledTimes(1);
    // It compared the supplied password (against the internal dummy hash).
    expect(compareSpy.mock.calls[0][0]).toBe('whatever');
  });

  it('returns null for a known username with a wrong password (also runs a compare)', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    const result = await userService.authenticate(KNOWN_USERNAME, 'wrong-password');

    expect(result).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the user for a known username with the correct password', async () => {
    const result = await userService.authenticate(KNOWN_USERNAME, KNOWN_PASSWORD);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(knownUser.id);
  });
});
