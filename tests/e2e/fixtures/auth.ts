// tests/e2e/fixtures/auth.ts
import { test as base, type Page } from '@playwright/test';
import { USERS } from './test-data';

type UserRole = keyof typeof USERS;

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await use(page);
  },
});

export function testAsRole(role: UserRole) {
  return base.extend({
    storageState: USERS[role].storageStatePath,
  });
}

export const adminTest = testAsRole('admin');
export const editorTest = testAsRole('editor');
export const viewerTest = testAsRole('viewer');

export { expect } from '@playwright/test';
