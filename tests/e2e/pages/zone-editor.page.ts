// tests/e2e/pages/zone-editor.page.ts
import { type Page, type Locator } from '@playwright/test';

export class ZoneEditorPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly typeFilter: Locator;
  readonly refreshButton: Locator;
  readonly addRecordButton: Locator;
  readonly deleteSelectedButton: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;
  readonly recordsTable: Locator;
  readonly tableRows: Locator;
  readonly pagination: Locator;
  readonly noKeyAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.typeFilter = page.locator('#record-type-filter');
    this.refreshButton = page.getByRole('button', { name: 'Refresh Records' });
    this.addRecordButton = page.getByRole('button', { name: /add record/i });
    this.deleteSelectedButton = page.getByRole('button', { name: /delete selected/i });
    this.undoButton = page.getByRole('button', { name: /undo/i });
    this.redoButton = page.getByRole('button', { name: /redo/i });
    this.recordsTable = page.locator('table');
    this.tableRows = page.locator('tbody tr');
    this.pagination = page.locator('.MuiTablePagination-root');
    this.noKeyAlert = page.locator('.MuiAlert-standardInfo');
  }

  async goto() {
    await this.page.goto('/zones');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async filterByType(type: string) {
    await this.typeFilter.click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  async refresh() {
    await this.refreshButton.click();
  }

  async getRowCount(): Promise<number> {
    return await this.tableRows.count();
  }

  async getRowText(index: number): Promise<string> {
    return await this.tableRows.nth(index).textContent() ?? '';
  }

  async clickEditOnRow(index: number) {
    const row = this.tableRows.nth(index);
    await row.locator('button[title="Edit Record"]').click();
  }

  async clickDeleteOnRow(index: number) {
    const row = this.tableRows.nth(index);
    await row.locator('button[title="Delete Record"]').click();
  }

  async clickCopyOnRow(index: number) {
    const row = this.tableRows.nth(index);
    await row.locator('button[title*="Copy"]').click();
  }

  async sortByColumn(columnName: string) {
    await this.page.locator('th').filter({ hasText: columnName }).locator('button, span').first().click();
  }

  async selectRow(index: number) {
    const row = this.tableRows.nth(index);
    await row.locator('input[type="checkbox"]').click();
  }

  async selectAllRows() {
    await this.page.locator('thead input[type="checkbox"]').click();
  }

  async waitForRecords() {
    await this.recordsTable.waitFor({ state: 'visible', timeout: 15_000 });
    // Wait for at least one data row
    await this.tableRows.first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async getRecordNames(): Promise<string[]> {
    const rows = await this.tableRows.all();
    const names: string[] = [];
    for (const row of rows) {
      const name = await row.locator('td').first().textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }
}
