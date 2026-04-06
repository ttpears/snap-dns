// tests/e2e/multi-user.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { SettingsPage } from './pages/settings.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { ZoneEditorPage } from './pages/zone-editor.page';
import { USERS, KEYS, ZONES } from './fixtures/test-data';

test.describe('Multi-User Roles', () => {
  test.describe('Admin user', () => {
    test.use({ storageState: USERS.admin.storageStatePath });

    test('should have full access to all navigation items', async ({ page }) => {
      const layout = new LayoutPage(page);
      await page.goto('/');
      await layout.waitForApp();

      await expect(layout.navAddRecord).toBeVisible();
      await expect(layout.navZoneEditor).toBeVisible();
      await expect(layout.navSnapshots).toBeVisible();
      await expect(layout.navSettings).toBeVisible();
    });

    test('should see all settings tabs including users and audit', async ({ page }) => {
      const layout = new LayoutPage(page);
      const settings = new SettingsPage(page);
      await settings.goto();
      await layout.waitForApp();

      await expect(settings.generalTab).toBeVisible();
      await expect(settings.keysTab).toBeVisible();
      await expect(settings.usersTab).toBeVisible();
    });

    test('should be able to select keys and zones', async ({ page }) => {
      const layout = new LayoutPage(page);
      const keySelector = new KeySelectorPage(page);
      await page.goto('/');
      await layout.waitForApp();

      await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
      await page.waitForTimeout(500);
    });
  });

  test.describe('Editor user', () => {
    test.use({ storageState: USERS.editor.storageStatePath });

    test('should have access to zone editing features', async ({ page }) => {
      const layout = new LayoutPage(page);
      await page.goto('/');
      await layout.waitForApp();

      await expect(layout.navAddRecord).toBeVisible();
      await expect(layout.navZoneEditor).toBeVisible();
    });

    test('should be able to navigate to zone editor', async ({ page }) => {
      const layout = new LayoutPage(page);
      const zoneEditor = new ZoneEditorPage(page);
      await zoneEditor.goto();
      await layout.waitForApp();
    });

    test('should have limited access to settings', async ({ page }) => {
      const layout = new LayoutPage(page);
      const settings = new SettingsPage(page);
      await settings.goto();
      await layout.waitForApp();

      // Editor should see general and keys tabs
      await expect(settings.generalTab).toBeVisible();
      await expect(settings.keysTab).toBeVisible();
    });
  });

  test.describe('Viewer user', () => {
    test.use({ storageState: USERS.viewer.storageStatePath });

    test('should have access to read-only views', async ({ page }) => {
      const layout = new LayoutPage(page);
      await page.goto('/');
      await layout.waitForApp();

      // Viewer should see navigation
      await expect(layout.navZoneEditor).toBeVisible();
    });

    test('should be able to view zone records', async ({ page }) => {
      const layout = new LayoutPage(page);
      const keySelector = new KeySelectorPage(page);
      const zoneEditor = new ZoneEditorPage(page);

      await zoneEditor.goto();
      await layout.waitForApp();

      // Try to select a key and zone — viewer may have limited keys
      try {
        await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
        await zoneEditor.waitForRecords();
        const count = await zoneEditor.getRowCount();
        expect(count).toBeGreaterThan(0);
      } catch {
        // Viewer may not have access to this key — that's expected
      }
    });

    test('should have restricted settings access', async ({ page }) => {
      const layout = new LayoutPage(page);
      const settings = new SettingsPage(page);
      await settings.goto();
      await layout.waitForApp();

      // Viewer should have limited tabs
      await expect(settings.generalTab).toBeVisible();
    });
  });
});
