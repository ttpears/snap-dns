// tests/e2e/pending-changes.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { AddRecordPage } from './pages/add-record.page';
import { PendingChangesPage } from './pages/pending-changes.page';
import { KEYS, ZONES } from './fixtures/test-data';

test.describe('Pending Changes', () => {
  let layout: LayoutPage;
  let keySelector: KeySelectorPage;
  let addRecord: AddRecordPage;
  let pendingChanges: PendingChangesPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    keySelector = new KeySelectorPage(page);
    addRecord = new AddRecordPage(page);
    pendingChanges = new PendingChangesPage(page);

    await addRecord.goto();
    await layout.waitForApp();
    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await page.waitForTimeout(500);
  });

  test('should open and close pending changes drawer', async () => {
    await layout.openPendingChanges();
    await pendingChanges.waitForDrawer();
    await expect(pendingChanges.drawer).toBeVisible();

    await pendingChanges.close();
    await expect(pendingChanges.drawer).not.toBeVisible();
  });

  test('should show added record in pending changes', async () => {
    // Add a record to create a pending change
    await addRecord.addARecord('pending-test', '1.2.3.4', '300');

    await layout.openPendingChanges();
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should remove a pending change', async () => {
    await addRecord.addARecord('remove-test', '1.2.3.4', '300');

    await layout.openPendingChanges();
    await pendingChanges.waitForDrawer();
    const countBefore = await pendingChanges.getChangeCount();
    expect(countBefore).toBeGreaterThan(0);

    await pendingChanges.removeChange(0);
    const countAfter = await pendingChanges.getChangeCount();
    expect(countAfter).toBeLessThan(countBefore);
  });

  test('should clear all pending changes', async () => {
    await addRecord.addARecord('clear-test-1', '1.2.3.4', '300');
    await addRecord.addARecord('clear-test-2', '5.6.7.8', '300');

    await layout.openPendingChanges();
    await pendingChanges.waitForDrawer();
    const countBefore = await pendingChanges.getChangeCount();
    expect(countBefore).toBeGreaterThan(0);

    await pendingChanges.clearAll();
    // Confirm dialog may appear
    const confirmButton = pendingChanges.page.locator('[role="dialog"]').getByRole('button', { name: /confirm|yes|clear/i });
    if (await confirmButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await expect(async () => {
      const countAfter = await pendingChanges.getChangeCount();
      expect(countAfter).toBe(0);
    }).toPass({ timeout: 5_000 });
  });

  test('should apply pending changes to DNS', async ({ page }) => {
    await addRecord.addARecord('apply-test', '10.20.30.40', '300');

    await layout.openPendingChanges();
    await pendingChanges.waitForDrawer();
    await pendingChanges.applyChanges();
    await pendingChanges.waitForApplyComplete();

    // After applying, pending changes should be empty
    await expect(async () => {
      const count = await pendingChanges.getChangeCount();
      expect(count).toBe(0);
    }).toPass({ timeout: 10_000 });
  });
});
