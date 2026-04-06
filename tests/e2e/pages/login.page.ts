// tests/e2e/pages/login.page.ts
import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorAlert: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[name="username"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.signInButton = page.getByRole('button', { name: 'Sign In', exact: true });
    this.errorAlert = page.locator('.MuiAlert-standardError');
    this.pageTitle = page.locator('h1');
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async waitForLoginForm() {
    await this.usernameInput.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async expectError(text?: string) {
    await this.errorAlert.waitFor({ state: 'visible' });
    if (text) {
      await this.errorAlert.filter({ hasText: text }).waitFor({ state: 'visible' });
    }
  }
}
