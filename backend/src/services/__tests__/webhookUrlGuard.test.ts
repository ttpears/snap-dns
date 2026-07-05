// backend/src/services/__tests__/webhookUrlGuard.test.ts
import { checkWebhookUrl } from '../webhookUrlGuard';

describe('checkWebhookUrl', () => {
  describe('blocked targets', () => {
    const blocked = [
      'http://localhost/hook',
      'https://localhost:8443/hook',
      'http://sub.localhost/hook',
      'http://127.0.0.1/hook',
      'http://127.1.2.3/hook',
      'http://0.0.0.0/hook',
      'http://169.254.169.254/latest/meta-data', // cloud metadata
      'http://169.254.0.1/hook', // link-local
      'http://[::1]/hook', // IPv6 loopback
      'http://[::]/hook', // IPv6 unspecified
      'http://[fe80::1]/hook', // IPv6 link-local
      'http://[::ffff:127.0.0.1]/hook', // IPv4-mapped loopback
    ];

    it.each(blocked)('blocks %s', (url) => {
      const result = checkWebhookUrl(url);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('bad schemes and malformed URLs', () => {
    it('rejects non-http(s) schemes', () => {
      expect(checkWebhookUrl('file:///etc/passwd').allowed).toBe(false);
      expect(checkWebhookUrl('ftp://example.com/x').allowed).toBe(false);
      expect(checkWebhookUrl('gopher://example.com/x').allowed).toBe(false);
    });

    it('rejects malformed / empty URLs', () => {
      expect(checkWebhookUrl('not a url').allowed).toBe(false);
      expect(checkWebhookUrl('').allowed).toBe(false);
      // @ts-expect-error testing runtime guard against non-string input
      expect(checkWebhookUrl(undefined).allowed).toBe(false);
    });
  });

  describe('private ranges are logged-but-allowed', () => {
    const privateHosts = [
      'http://10.0.0.5/hook',
      'http://172.16.0.1/hook',
      'http://172.31.255.255/hook',
      'http://192.168.1.10/hook',
      'http://[fc00::1]/hook',
      'http://[fd12:3456::1]/hook',
    ];

    it.each(privateHosts)('allows %s with a warning', (url) => {
      const result = checkWebhookUrl(url);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeTruthy();
    });

    it('does not treat 172.32.x (outside /12) as private', () => {
      const result = checkWebhookUrl('http://172.32.0.1/hook');
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('public targets are allowed without warning', () => {
    const allowed = [
      'https://hooks.slack.com/services/T000/B000/XXXX',
      'https://discord.com/api/webhooks/123/abc',
      'https://example.com/webhook',
      'http://93.184.216.34/hook', // public IPv4 literal
    ];

    it.each(allowed)('allows %s', (url) => {
      const result = checkWebhookUrl(url);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });
  });
});
