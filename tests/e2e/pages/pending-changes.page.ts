// tests/e2e/pages/pending-changes.page.ts
import { type Page, type Locator } from '@playwright/test';

export class PendingChangesPage {
  readonly page: Page;
  readonly drawer: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly changesList: Locator;
  readonly changeItems: Locator;
  readonly applyButton: Locator;
  readonly clearAllButton: Locator;
  readonly errorAlert: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.drawer = page.locator('.MuiDrawer-paperAnchorRight');
    this.title = page.locator('.MuiDrawer-root').getByText('Pending Changes');
    this.closeButton = page.locator('.MuiDrawer-root button[aria-label="Close"], .MuiDrawer-root button[aria-label="close"]');
    this.changesList = page.locator('.MuiDrawer-root .MuiList-root');
    this.changeItems = page.locator('.MuiDrawer-root .MuiListItem-root');
    this.applyButton = page.locator('.MuiDrawer-root').getByRole('button', { name: /apply changes/i });
    this.clearAllButton = page.locator('.MuiDrawer-root').getByRole('button', { name: /clear all/i });
    this.errorAlert = page.locator('.MuiDrawer-root .MuiAlert-standardError');
    this.loadingSpinner = page.locator('.MuiDrawer-root .MuiCircularProgress-root');
  }

  async waitForDrawer() {
    await this.drawer.waitFor({ state: 'visible' });
  }

  async close() {
    await this.closeButton.click();
    await this.drawer.waitFor({ state: 'hidden' });
  }

  async getChangeCount(): Promise<number> {
    return await this.changeItems.count();
  }

  async removeChange(index: number) {
    const item = this.changeItems.nth(index);
    await item.locator('button[aria-label*="delete"], button[aria-label*="remove"]').click();
  }

  async applyChanges() {
    await this.applyButton.click();
  }

  async clearAll() {
    await this.clearAllButton.click();
  }

  async waitForApplyComplete() {
    // Wait for spinner to appear then disappear
    try {
      await this.loadingSpinner.waitFor({ state: 'visible', timeout: 2_000 });
    } catch {
      // Spinner may have already finished
    }
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 30_000 });
  }
}
