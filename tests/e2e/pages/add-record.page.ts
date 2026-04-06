// tests/e2e/pages/add-record.page.ts
import { type Page, type Locator } from '@playwright/test';

export class AddRecordPage {
  readonly page: Page;
  readonly recordTypeSelect: Locator;
  readonly nameInput: Locator;
  readonly ttlInput: Locator;
  readonly addButton: Locator;
  readonly successAlert: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.recordTypeSelect = page.locator('#record-type-select');
    this.nameInput = page.locator('input[name="name"], input[id="record-name"]').first();
    this.ttlInput = page.locator('input[name="ttl"], input[id="record-ttl"]').first();
    this.addButton = page.getByRole('button', { name: /add record/i });
    this.successAlert = page.locator('.MuiAlert-standardSuccess');
    this.errorAlert = page.locator('.MuiAlert-standardError');
  }

  async goto() {
    await this.page.goto('/');
  }

  async selectRecordType(type: string) {
    await this.recordTypeSelect.click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  async fillTTL(ttl: string) {
    await this.ttlInput.fill(ttl);
  }

  async addARecord(name: string, value: string, ttl = '300') {
    await this.selectRecordType('A');
    await this.fillName(name);
    await this.fillTTL(ttl);
    // Fill the IPv4 address field
    const valueInput = this.page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill(value);
    await this.addButton.click();
  }

  async addAAAARecord(name: string, value: string, ttl = '300') {
    await this.selectRecordType('AAAA');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const valueInput = this.page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill(value);
    await this.addButton.click();
  }

  async addCNAMERecord(name: string, target: string, ttl = '300') {
    await this.selectRecordType('CNAME');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const valueInput = this.page.locator('input[name="value"], input[id="record-value"]').first();
    await valueInput.fill(target);
    await this.addButton.click();
  }

  async addMXRecord(name: string, priority: string, mailServer: string, ttl = '300') {
    await this.selectRecordType('MX');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const priorityInput = this.page.locator('input[name="priority"], input[id="record-priority"]').first();
    const valueInput = this.page.locator('input[name="value"], input[id="record-value"]').first();
    await priorityInput.fill(priority);
    await valueInput.fill(mailServer);
    await this.addButton.click();
  }

  async addTXTRecord(name: string, text: string, ttl = '300') {
    await this.selectRecordType('TXT');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const valueInput = this.page.locator('textarea[name="value"], textarea[id="record-value"], input[name="value"]').first();
    await valueInput.fill(text);
    await this.addButton.click();
  }

  async addSRVRecord(name: string, priority: string, weight: string, port: string, target: string, ttl = '300') {
    await this.selectRecordType('SRV');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const priorityInput = this.page.locator('input[name="priority"], input[id="record-priority"]').first();
    const weightInput = this.page.locator('input[name="weight"], input[id="record-weight"]').first();
    const portInput = this.page.locator('input[name="port"], input[id="record-port"]').first();
    const targetInput = this.page.locator('input[name="target"], input[id="record-target"]').first();
    await priorityInput.fill(priority);
    await weightInput.fill(weight);
    await portInput.fill(port);
    await targetInput.fill(target);
    await this.addButton.click();
  }

  async addCAARecord(name: string, flags: string, tag: string, value: string, ttl = '300') {
    await this.selectRecordType('CAA');
    await this.fillName(name);
    await this.fillTTL(ttl);
    const flagsInput = this.page.locator('input[name="flags"], input[id="record-flags"]').first();
    const tagInput = this.page.locator('input[name="tag"], input[id="record-tag"]');
    const valueInput = this.page.locator('input[name="value"], input[id="record-value"]').first();
    await flagsInput.fill(flags);
    // Tag might be a select
    if (await tagInput.count() > 0) {
      await tagInput.first().fill(tag);
    } else {
      // It might be a select dropdown
      const tagSelect = this.page.locator('#record-tag-select');
      if (await tagSelect.count() > 0) {
        await tagSelect.click();
        await this.page.getByRole('option', { name: tag }).click();
      }
    }
    await valueInput.fill(value);
    await this.addButton.click();
  }

  async expectSuccess() {
    await this.successAlert.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async expectError() {
    await this.errorAlert.waitFor({ state: 'visible', timeout: 10_000 });
  }
}
