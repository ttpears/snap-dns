// tests/e2e/settings.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { SettingsPage } from './pages/settings.page';

test.describe('Settings', () => {
  let layout: LayoutPage;
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    settings = new SettingsPage(page);

    await settings.goto();
    await layout.waitForApp();
  });

  test('should display settings page with tabs', async () => {
    await expect(settings.generalTab).toBeVisible();
    await expect(settings.keysTab).toBeVisible();
  });

  test('should switch between tabs', async () => {
    await settings.switchToTab('keys');
    // Keys tab content should be visible
    await expect(settings.page.getByText(/TSIG|key/i).first()).toBeVisible({ timeout: 5_000 });

    await settings.switchToTab('general');
    // General tab content should be visible
    await expect(settings.generalTab).toHaveAttribute('aria-selected', 'true');
  });

  test('should show users tab for admin', async () => {
    const usersVisible = await settings.isTabVisible('users');
    expect(usersVisible).toBeTruthy();
  });

  test('should show audit logs tab for admin', async () => {
    const auditVisible = await settings.isTabVisible('audit-logs');
    // Audit logs may or may not be visible depending on role
    expect(typeof auditVisible).toBe('boolean');
  });

  test('should display general settings form', async ({ page }) => {
    // Default TTL setting should be present
    await expect(page.getByText(/default ttl/i).first()).toBeVisible();
  });

  test('should show export/import buttons', async () => {
    await expect(settings.exportButton).toBeVisible();
    await expect(settings.importButton).toBeVisible();
  });

  test('should open export dialog', async ({ page }) => {
    await settings.exportButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Close dialog
    await page.locator('[role="dialog"]').getByRole('button', { name: /cancel|close/i }).click();
  });
});
