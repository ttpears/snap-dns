// tests/e2e/dark-mode.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';

test.describe('Dark Mode', () => {
  let layout: LayoutPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    await page.goto('/');
    await layout.waitForApp();
  });

  test('should toggle dark mode', async ({ page }) => {
    // Get initial theme
    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    await layout.toggleDarkMode();
    await page.waitForTimeout(500);

    const newBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    expect(newBg).not.toBe(initialBg);
  });

  test('should persist dark mode after page reload', async ({ page }) => {
    await layout.toggleDarkMode();
    await page.waitForTimeout(500);

    const bgAfterToggle = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    await page.reload();
    await layout.waitForApp();

    const bgAfterReload = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    expect(bgAfterReload).toBe(bgAfterToggle);
  });

  test('should toggle back to light mode', async ({ page }) => {
    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    // Toggle to dark
    await layout.toggleDarkMode();
    await page.waitForTimeout(500);

    // Toggle back to light
    await layout.toggleDarkMode();
    await page.waitForTimeout(500);

    const finalBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    expect(finalBg).toBe(initialBg);
  });
});
