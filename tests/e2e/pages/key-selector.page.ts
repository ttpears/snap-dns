// tests/e2e/pages/key-selector.page.ts
import { type Page, type Locator } from '@playwright/test';

export class KeySelectorPage {
  readonly page: Page;
  readonly keySelect: Locator;
  readonly zoneSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    // MUI Select components — target the clickable select element
    this.keySelect = page.locator('#key-select');
    this.zoneSelect = page.locator('#zone-select');
  }

  async selectKey(keyName: string) {
    await this.keySelect.click();
    await this.page.getByRole('option', { name: new RegExp(keyName) }).click();
  }

  async selectZone(zoneName: string) {
    await this.zoneSelect.click();
    await this.page.getByRole('option', { name: zoneName }).click();
  }

  async selectKeyAndZone(keyName: string, zoneName: string) {
    await this.selectKey(keyName);
    // Wait for zone dropdown to be populated
    await this.page.waitForTimeout(500);
    await this.selectZone(zoneName);
  }

  async getSelectedKey(): Promise<string> {
    return await this.keySelect.textContent() ?? '';
  }

  async getSelectedZone(): Promise<string> {
    return await this.zoneSelect.textContent() ?? '';
  }
}
