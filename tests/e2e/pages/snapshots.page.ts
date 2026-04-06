// tests/e2e/pages/snapshots.page.ts
import { type Page, type Locator } from '@playwright/test';

export class SnapshotsPage {
  readonly page: Page;
  readonly snapshotsTab: Locator;
  readonly restoreTab: Locator;
  readonly createSnapshotButton: Locator;
  readonly snapshotList: Locator;
  readonly snapshotItems: Locator;
  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;
  readonly successAlert: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.snapshotsTab = page.locator('button[id="snapshots-tab-0"]');
    this.restoreTab = page.locator('button[id="snapshots-tab-1"]');
    this.createSnapshotButton = page.getByRole('button', { name: /create snapshot/i });
    this.snapshotList = page.locator('.MuiAccordion-root, table tbody');
    this.snapshotItems = page.locator('.MuiAccordion-root, table tbody tr');
    this.confirmDialog = page.locator('[role="dialog"]');
    this.confirmButton = page.locator('[role="dialog"]').getByRole('button', { name: /confirm|restore|yes|ok/i });
    this.cancelButton = page.locator('[role="dialog"]').getByRole('button', { name: /cancel/i });
    this.successAlert = page.locator('.MuiAlert-standardSuccess');
    this.errorAlert = page.locator('.MuiAlert-standardError');
  }

  async selectZone(zone: string) {
    await this.page.locator('#snapshot-zone-select').click();
    await this.page.getByRole('option', { name: zone, exact: true }).click();
  }

  async selectKey(keyName: string) {
    await this.page.locator('#snapshot-key-select').click();
    await this.page.getByRole('option', { name: new RegExp(keyName) }).click();
  }

  async goto() {
    await this.page.goto('/snapshots');
  }

  async createSnapshot() {
    await this.createSnapshotButton.click();
  }

  async getSnapshotCount(): Promise<number> {
    return await this.snapshotItems.count();
  }

  async expandSnapshot(index: number) {
    await this.snapshotItems.nth(index).click();
  }

  async deleteSnapshot(index: number) {
    const item = this.snapshotItems.nth(index);
    await item.locator('button').filter({ hasText: /delete/i }).click();
  }

  async restoreSnapshot(index: number) {
    const restoreButtons = this.page.getByRole('button', { name: /restore this snapshot/i });
    await restoreButtons.nth(index).click();
  }

  async confirmAction() {
    await this.confirmButton.click();
  }

  async cancelAction() {
    await this.cancelButton.click();
  }

  async switchToRestore() {
    await this.restoreTab.click();
  }

  async expectSuccess() {
    await this.successAlert.waitFor({ state: 'visible', timeout: 10_000 });
  }
}
