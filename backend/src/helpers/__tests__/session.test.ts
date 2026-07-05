// backend/src/helpers/__tests__/session.test.ts
import { regenerateSession } from '../session';

describe('regenerateSession', () => {
  it('resolves and invokes session.regenerate exactly once on success', async () => {
    const regenerate = jest.fn((cb: (err: unknown) => void) => cb(null));
    await expect(regenerateSession({ regenerate })).resolves.toBeUndefined();
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it('rejects when regenerate yields an error', async () => {
    const boom = new Error('store failure');
    const regenerate = jest.fn((cb: (err: unknown) => void) => cb(boom));
    await expect(regenerateSession({ regenerate })).rejects.toBe(boom);
  });

  it('wraps non-Error rejection reasons in an Error', async () => {
    const regenerate = jest.fn((cb: (err: unknown) => void) => cb('string failure'));
    await expect(regenerateSession({ regenerate })).rejects.toBeInstanceOf(Error);
  });

  it('does not populate fields before regeneration completes (ordering contract)', async () => {
    // Simulates the login flow: fields must be set only after regenerate resolves.
    const order: string[] = [];
    const session = {
      userId: undefined as string | undefined,
      regenerate(cb: (err: unknown) => void) {
        order.push('regenerate');
        // Emulate express-session wiping the session before the callback.
        this.userId = undefined;
        cb(null);
      },
    };

    await regenerateSession(session);
    session.userId = 'user-1';
    order.push('set-fields');

    expect(order).toEqual(['regenerate', 'set-fields']);
    expect(session.userId).toBe('user-1');
  });
});
