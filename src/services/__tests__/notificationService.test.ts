// src/services/__tests__/notificationService.test.ts
// The webhook proxy endpoint (/api/webhook/notify) is behind requireAuth, so the
// browser MUST send the session cookie. Without credentials:'include' the request
// is unauthenticated (401 NOT_AUTHENTICATED) and both the "Test Webhook" button
// and real change notifications fail. Regression test for that.
import { notificationService } from '../notificationService';

describe('notificationService — backend webhook proxy auth', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      clone: () => ({ text: async () => '' }),
      json: async () => ({ success: true }),
    });
    notificationService.setWebhookConfig('https://example.com/hook', 'teams');
  });

  it('posts to /api/webhook/notify with the session cookie (credentials: include)', async () => {
    await notificationService.testWebhook();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/webhook/notify');
    expect(opts.method).toBe('POST');
    // The crux: the request must carry the session cookie, or requireAuth 401s.
    expect(opts.credentials).toBe('include');
  });
});
