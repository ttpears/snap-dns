// tests/e2e/error-handling.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { AddRecordPage } from './pages/add-record.page';
import { ZoneEditorPage } from './pages/zone-editor.page';
import { KEYS, ZONES } from './fixtures/test-data';

test.describe('Error Handling', () => {
  let layout: LayoutPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    await page.goto('/');
    await layout.waitForApp();
  });

  test('should show warning when no key is configured for zone editor', async ({ page }) => {
    const zoneEditor = new ZoneEditorPage(page);
    await zoneEditor.goto();
    // Without selecting a key, should show an info/warning alert
    const alert = page.locator('.MuiAlert-root');
    await expect(alert.first()).toBeVisible({ timeout: 5_000 });
  });

  test('should validate empty record name', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    const addRecord = new AddRecordPage(page);

    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await page.waitForTimeout(500);

    await addRecord.selectRecordType('A');
    // Leave name empty, fill only the value
    await addRecord.fillTTL('300');
    const valueInput = page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill('1.2.3.4');

    await addRecord.addButton.click();

    // Should show validation error or the button should be disabled
    const helperText = page.locator('.MuiFormHelperText-root');
    const errorAlert = page.locator('.MuiAlert-standardError');
    const hasError = await helperText.count() > 0 || await errorAlert.count() > 0 || await addRecord.addButton.isDisabled();
    expect(hasError).toBeTruthy();
  });

  test('should validate invalid IPv4 address for A record', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    const addRecord = new AddRecordPage(page);

    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await page.waitForTimeout(500);

    await addRecord.selectRecordType('A');
    await addRecord.fillName('invalid-ip-test');
    await addRecord.fillTTL('300');
    const valueInput = page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill('999.999.999.999');

    await addRecord.addButton.click();

    // Should show validation error
    const helperText = page.locator('.MuiFormHelperText-root.Mui-error');
    const errorAlert = page.locator('.MuiAlert-standardError');
    await expect(async () => {
      const hasHelper = await helperText.count() > 0;
      const hasAlert = await errorAlert.count() > 0;
      expect(hasHelper || hasAlert).toBeTruthy();
    }).toPass({ timeout: 5_000 });
  });

  test('should validate invalid IPv6 address for AAAA record', async ({ page }) => {
    const keySelector = new KeySelectorPage(page);
    const addRecord = new AddRecordPage(page);

    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await page.waitForTimeout(500);

    await addRecord.selectRecordType('AAAA');
    await addRecord.fillName('invalid-ipv6-test');
    await addRecord.fillTTL('300');
    const valueInput = page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill('not-an-ipv6');

    await addRecord.addButton.click();

    const helperText = page.locator('.MuiFormHelperText-root.Mui-error');
    const errorAlert = page.locator('.MuiAlert-standardError');
    await expect(async () => {
      const hasHelper = await helperText.count() > 0;
      const hasAlert = await errorAlert.count() > 0;
      expect(hasHelper || hasAlert).toBeTruthy();
    }).toPass({ timeout: 5_000 });
  });

  test('should handle navigating to non-existent route', async ({ page }) => {
    await page.goto('/nonexistent');
    // Should redirect to a valid page or show the app
    await layout.waitForApp();
  });
});
