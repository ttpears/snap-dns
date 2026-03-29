// tests/e2e/pages/layout.page.ts
import { type Page, type Locator } from '@playwright/test';

export class LayoutPage {
  readonly page: Page;
  readonly navAddRecord: Locator;
  readonly navZoneEditor: Locator;
  readonly navSnapshots: Locator;
  readonly navSettings: Locator;
  readonly darkModeToggle: Locator;
  readonly pendingChangesButton: Locator;
  readonly userMenuChip: Locator;
  readonly logoutMenuItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navAddRecord = page.getByRole('link', { name: 'Add DNS Record' });
    this.navZoneEditor = page.getByRole('link', { name: 'Zone Editor' });
    this.navSnapshots = page.getByRole('link', { name: 'Snapshots' });
    this.navSettings = page.getByRole('link', { name: 'Settings', exact: true });
    this.darkModeToggle = page.locator('button').filter({ has: page.locator('[data-testid="Brightness4Icon"], [data-testid="Brightness7Icon"]') });
    this.pendingChangesButton = page.getByRole('button', { name: /pending changes/i });
    this.userMenuChip = page.locator('.MuiChip-root').first();
    this.logoutMenuItem = page.getByRole('menuitem', { name: /logout/i });
  }

  async navigateTo(section: 'add-record' | 'zone-editor' | 'snapshots' | 'settings') {
    const navMap = {
      'add-record': this.navAddRecord,
      'zone-editor': this.navZoneEditor,
      'snapshots': this.navSnapshots,
      'settings': this.navSettings,
    };
    await navMap[section].click();
  }

  async toggleDarkMode() {
    await this.darkModeToggle.click();
  }

  async openPendingChanges() {
    await this.pendingChangesButton.click();
  }

  async logout() {
    await this.userMenuChip.click();
    await this.logoutMenuItem.click();
  }

  async waitForApp() {
    // Wait for the navigation sidebar to be visible (indicates app is loaded)
    await this.navSettings.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
