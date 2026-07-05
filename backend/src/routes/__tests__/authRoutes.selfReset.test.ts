// backend/src/routes/__tests__/authRoutes.selfReset.test.ts
// Unit test for the self-vs-other decision that gates the current-password
// requirement on PATCH /users/:userId/password. An admin resetting their OWN
// password must supply the current password; resetting another user's must not.
import { selfPasswordResetRequiresCurrent } from '../authRoutes';

describe('selfPasswordResetRequiresCurrent', () => {
  it('requires the current password when an admin resets their own password', () => {
    expect(selfPasswordResetRequiresCurrent('admin-id', 'admin-id')).toBe(true);
  });

  it('does not require the current password when resetting another user', () => {
    expect(selfPasswordResetRequiresCurrent('target-user-id', 'admin-id')).toBe(false);
  });
});
