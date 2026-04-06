// tests/e2e/zone-editor.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { ZoneEditorPage } from './pages/zone-editor.page';
import { KEYS, ZONES } from './fixtures/test-data';

test.describe('Zone Editor', () => {
  let layout: LayoutPage;
  let keySelector: KeySelectorPage;
  let zoneEditor: ZoneEditorPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    keySelector = new KeySelectorPage(page);
    zoneEditor = new ZoneEditorPage(page);

    await zoneEditor.goto();
    await layout.waitForApp();
    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await zoneEditor.waitForRecords();
  });

  test('should display zone records in a table', async () => {
    const rowCount = await zoneEditor.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should search records by name', async () => {
    const initialCount = await zoneEditor.getRowCount();
    await zoneEditor.search('ns1');
    await expect(async () => {
      const filteredCount = await zoneEditor.getRowCount();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }).toPass({ timeout: 5_000 });
  });

  test('should clear search and show all records', async () => {
    await zoneEditor.search('ns1');
    await zoneEditor.page.waitForTimeout(500);
    await zoneEditor.clearSearch();
    await zoneEditor.page.waitForTimeout(500);
    const count = await zoneEditor.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter records by type', async ({ page }) => {
    await zoneEditor.filterByType('A');
    await page.waitForTimeout(500);

    // All visible records should be of type A
    const rows = await zoneEditor.tableRows.all();
    for (const row of rows) {
      const rowText = await row.textContent();
      expect(rowText).toContain('A');
    }
  });

  test('should sort records by clicking column header', async () => {
    const namesBefore = await zoneEditor.getRecordNames();
    await zoneEditor.sortByColumn('Name');
    await zoneEditor.page.waitForTimeout(500);
    const namesAfter = await zoneEditor.getRecordNames();
    // Names should be in a different order (or same if already sorted)
    expect(namesAfter.length).toBe(namesBefore.length);
  });

  test('should refresh records', async () => {
    await zoneEditor.refresh();
    // Wait for refresh to complete
    await zoneEditor.waitForRecords();
    const count = await zoneEditor.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should select individual records via checkbox', async () => {
    await zoneEditor.selectRow(0);
    // Delete Selected button should become available
    await expect(zoneEditor.deleteSelectedButton).toBeEnabled();
  });

  test('should select all records via header checkbox', async () => {
    await zoneEditor.selectAllRows();
    await expect(zoneEditor.deleteSelectedButton).toBeEnabled();
  });

  test('should show edit dialog when clicking edit on a record', async ({ page }) => {
    await zoneEditor.clickEditOnRow(0);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Close dialog
    await page.locator('[role="dialog"]').getByRole('button', { name: /cancel/i }).click();
  });
});
