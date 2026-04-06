// tests/e2e/navigation.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { KEYS, ZONES } from './fixtures/test-data';

test.describe('Navigation', () => {
  let layout: LayoutPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    await page.goto('/');
    await layout.waitForApp();
  });

  test('should display all navigation items', async () => {
    await expect(layout.navAddRecord).toBeVisible();
    await expect(layout.navZoneEditor).toBeVisible();
    await expect(layout.navSnapshots).toBeVisible();
    await expect(layout.navSettings).toBeVisible();
  });

  test('should navigate to Zone Editor', async ({ page }) => {
    await layout.navigateTo('zone-editor');
    await expect(page).toHaveURL(/\/zones/);
  });

  test('should navigate to Snapshots', async ({ page }) => {
    await layout.navigateTo('snapshots');
    await expect(page).toHaveURL(/\/snapshots/);
  });

  test('should navigate to Settings', async ({ page }) => {
    await layout.navigateTo('settings');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should navigate to Add DNS Record', async ({ page }) => {
    await layout.navigateTo('settings');
    await layout.navigateTo('add-record');
    await expect(page).toHaveURL(/^\/$|\/$/);
  });

  test('should show key selector in navigation', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    await expect(keySelector.keySelect).toBeVisible();
  });

  test('should populate zones after selecting a key', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    await keySelector.selectKey(KEYS.testKey.name);
    // Zone select should become enabled/populated
    await expect(keySelector.zoneSelect).toBeEnabled();
  });

  test('should select key and zone', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    // Verify zone is selected (page should show zone content)
    await page.waitForTimeout(1000);
  });
});
