// backend/jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  clearMocks: true,
  // Force the explicit security opt-outs for tests (see jest.setup.js) instead of
  // weakening the secure-by-default toggles in config/securityToggles.ts.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
