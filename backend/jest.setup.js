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
