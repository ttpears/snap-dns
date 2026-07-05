// backend/jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  clearMocks: true,
  // Several suites (user auth, route integration) run real bcrypt at cost
  // factor 12. Under the full parallel run those hashes contend for CPU and can
  // blow the default 5s timeout, so give every test/hook generous headroom
  // while still catching genuine hangs.
  testTimeout: 20000,
  // Force the explicit security opt-outs for tests (see jest.setup.js) instead of
  // weakening the secure-by-default toggles in config/securityToggles.ts.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
