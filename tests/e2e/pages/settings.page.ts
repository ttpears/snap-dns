// tests/e2e/pages/settings.page.ts
import { type Page, type Locator } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly generalTab: Locator;
  readonly keysTab: Locator;
  readonly usersTab: Locator;
  readonly ssoTab: Locator;
  readonly auditLogsTab: Locator;
  readonly saveButton: Locator;
  readonly testWebhookButton: Locator;
  readonly exportButton: Locator;
  readonly importButton: Locator;
  readonly successAlert: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.generalTab = page.locator('button[id="settings-tab-0"]');
    this.keysTab = page.locator('button[id="settings-tab-1"]');
    this.usersTab = page.locator('button[id="settings-tab-2"]');
    this.ssoTab = page.locator('button[id="settings-tab-3"]');
    this.auditLogsTab = page.locator('button[id="settings-tab-4"]');
    this.saveButton = page.getByRole('button', { name: /save settings/i });
    this.testWebhookButton = page.getByRole('button', { name: /test webhook/i });
    this.exportButton = page.getByRole('button', { name: /export/i }).first();
    this.importButton = page.getByRole('button', { name: /import/i }).first();
    this.successAlert = page.locator('.MuiAlert-standardSuccess');
    this.errorAlert = page.locator('.MuiAlert-standardError');
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async switchToTab(tab: 'general' | 'keys' | 'users' | 'sso' | 'audit-logs') {
    const tabMap = {
      'general': this.generalTab,
      'keys': this.keysTab,
      'users': this.usersTab,
      'sso': this.ssoTab,
      'audit-logs': this.auditLogsTab,
    };
    await tabMap[tab].click();
  }

  async isTabVisible(tab: 'general' | 'keys' | 'users' | 'sso' | 'audit-logs'): Promise<boolean> {
    const tabMap = {
      'general': this.generalTab,
      'keys': this.keysTab,
      'users': this.usersTab,
      'sso': this.ssoTab,
      'audit-logs': this.auditLogsTab,
    };
    return await tabMap[tab].isVisible();
  }

  async saveSettings() {
    await this.saveButton.click();
  }

  async expectSuccess() {
    await this.successAlert.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async expectError() {
    await this.errorAlert.waitFor({ state: 'visible', timeout: 10_000 });
  }
}
