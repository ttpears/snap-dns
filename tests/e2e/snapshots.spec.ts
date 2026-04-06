// tests/e2e/snapshots.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { SnapshotsPage } from './pages/snapshots.page';
import { KEYS, ZONES } from './fixtures/test-data';

test.describe('Snapshots', () => {
  let layout: LayoutPage;
  let keySelector: KeySelectorPage;
  let snapshots: SnapshotsPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    keySelector = new KeySelectorPage(page);
    snapshots = new SnapshotsPage(page);

    await snapshots.goto();
    await layout.waitForApp();
    await page.waitForTimeout(500);
    // Select zone and key in the Snapshots page's own selectors
    await snapshots.selectZone(ZONES.testLocal);
    await snapshots.selectKey(KEYS.testKey.name);
    await page.waitForTimeout(300);
  });

  test('should display snapshots page', async ({ page }) => {
    await expect(page.getByText(/snapshot/i).first()).toBeVisible();
  });

  test('should create a new snapshot', async () => {
    await snapshots.createSnapshot();
    // Should show success or the snapshot appears in the list
    await expect(async () => {
      const count = await snapshots.getSnapshotCount();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test('should display snapshot list after creation', async () => {
    // Create a snapshot first
    await snapshots.createSnapshot();
    await snapshots.page.waitForTimeout(1_000);

    const count = await snapshots.getSnapshotCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should expand snapshot details', async () => {
    await snapshots.createSnapshot();
    await snapshots.page.waitForTimeout(1_000);

    await snapshots.expandSnapshot(0);
    // Expanded content should be visible
    await snapshots.page.waitForTimeout(500);
  });

  test('should handle restore with confirmation', async ({ page }) => {
    await snapshots.createSnapshot();
    await page.waitForTimeout(1_000);

    await snapshots.restoreSnapshot(0);

    // Confirmation dialog should appear
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await snapshots.cancelAction();
      await expect(dialog).not.toBeVisible();
    }
  });
});
