// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { LayoutPage } from './pages/layout.page';
import { USERS } from './fixtures/test-data';

test.describe('Authentication', () => {
  // These tests do NOT use saved storageState — they test the login flow itself
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should show login page when not authenticated', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();

    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
  });

  test('should login successfully with valid admin credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();
    await loginPage.login(USERS.admin.username, USERS.admin.password);

    // Should redirect to app
    const layout = new LayoutPage(page);
    await layout.waitForApp();
    await expect(layout.navSettings).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();
    await loginPage.login('wronguser', 'wrongpass');

    await loginPage.expectError();
  });

  test('should show error with empty credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();

    // Sign in button should be disabled with empty fields
    await expect(loginPage.signInButton).toBeDisabled();
  });

  test('should logout successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();
    await loginPage.login(USERS.admin.username, USERS.admin.password);

    const layout = new LayoutPage(page);
    await layout.waitForApp();
    await layout.logout();

    // Should return to login page
    await loginPage.waitForLoginForm();
    await expect(loginPage.usernameInput).toBeVisible();
  });

  test('should persist session across page reloads', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();
    await loginPage.login(USERS.admin.username, USERS.admin.password);

    const layout = new LayoutPage(page);
    await layout.waitForApp();

    // Reload the page
    await page.reload();
    await layout.waitForApp();
    await expect(layout.navSettings).toBeVisible();
  });
});
