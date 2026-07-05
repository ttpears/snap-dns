// backend/jest.setup.js
// Test-environment security-toggle overrides.
//
// The application defaults to SECURE (rate limiting on, cookies Secure) so that
// a production deployment that forgets NODE_ENV=production is not silently
// insecure. The test suite legitimately needs those toggles off: HTTP-level
// tests may fire many requests (which real rate limits would throttle) and run
// over plain HTTP. We set the explicit opt-out here rather than weakening the
// default so the secure default remains in force everywhere else.
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.COOKIE_SECURE = 'false';

// Filesystem isolation for every test file.
//
// The JSON-backed services (userService, tsigKeyService, auditService, backup,
// webhook-config, sso-config) resolve their storage paths from
// `path.join(process.cwd(), 'data', ...)` at module load. Point the process at a
// fresh throwaway working directory BEFORE any service module is imported so
// that (a) tests never read or clobber the real `backend/data/` directory and
// (b) each test file starts from a clean, empty data dir. This runs in
// `setupFiles`, which executes before the test file's own imports, so the
// service modules capture the temp path rather than the repo path.
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmpDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-dns-jest-'));
fs.mkdirSync(path.join(tmpDataRoot, 'data'), { recursive: true });
process.chdir(tmpDataRoot);
