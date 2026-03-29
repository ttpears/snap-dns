// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { USERS } from './fixtures/test-data';
import { LoginPage } from './pages/login.page';

for (const [role, user] of Object.entries(USERS)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForLoginForm();
    await loginPage.login(user.username, user.password);

    // Wait for successful login — app should show navigation
    await expect(page.getByText('Settings', { exact: false })).toBeVisible({ timeout: 15_000 });

    // Save signed-in state
    await page.context().storageState({ path: user.storageStatePath });
  });
}
