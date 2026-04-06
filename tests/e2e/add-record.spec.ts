// tests/e2e/add-record.spec.ts
import { test, expect } from '@playwright/test';
import { LayoutPage } from './pages/layout.page';
import { KeySelectorPage } from './pages/key-selector.page';
import { AddRecordPage } from './pages/add-record.page';
import { PendingChangesPage } from './pages/pending-changes.page';
import { KEYS, ZONES, TEST_RECORDS } from './fixtures/test-data';

test.describe('Add DNS Record', () => {
  let layout: LayoutPage;
  let keySelector: KeySelectorPage;
  let addRecord: AddRecordPage;

  test.beforeEach(async ({ page }) => {
    layout = new LayoutPage(page);
    keySelector = new KeySelectorPage(page);
    addRecord = new AddRecordPage(page);

    await addRecord.goto();
    await layout.waitForApp();
    await keySelector.selectKeyAndZone(KEYS.testKey.name, ZONES.testLocal);
    await page.waitForTimeout(500);
  });

  test('should add an A record', async ({ page }) => {
    await addRecord.addARecord(
      TEST_RECORDS.a.name,
      TEST_RECORDS.a.value,
      String(TEST_RECORDS.a.ttl),
    );

    // Should appear in pending changes
    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add an AAAA record', async ({ page }) => {
    await addRecord.addAAAARecord(
      TEST_RECORDS.aaaa.name,
      TEST_RECORDS.aaaa.value,
      String(TEST_RECORDS.aaaa.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add a CNAME record', async ({ page }) => {
    await addRecord.addCNAMERecord(
      TEST_RECORDS.cname.name,
      TEST_RECORDS.cname.value,
      String(TEST_RECORDS.cname.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add an MX record', async ({ page }) => {
    await addRecord.addMXRecord(
      TEST_RECORDS.mx.name,
      String(TEST_RECORDS.mx.priority),
      TEST_RECORDS.mx.value,
      String(TEST_RECORDS.mx.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add a TXT record', async ({ page }) => {
    await addRecord.addTXTRecord(
      TEST_RECORDS.txt.name,
      TEST_RECORDS.txt.value,
      String(TEST_RECORDS.txt.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add an SRV record', async ({ page }) => {
    await addRecord.addSRVRecord(
      TEST_RECORDS.srv.name,
      String(TEST_RECORDS.srv.priority),
      String(TEST_RECORDS.srv.weight),
      String(TEST_RECORDS.srv.port),
      TEST_RECORDS.srv.value,
      String(TEST_RECORDS.srv.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should add a CAA record', async ({ page }) => {
    await addRecord.addCAARecord(
      TEST_RECORDS.caa.name,
      String(TEST_RECORDS.caa.flags),
      TEST_RECORDS.caa.tag,
      TEST_RECORDS.caa.value,
      String(TEST_RECORDS.caa.ttl),
    );

    await layout.openPendingChanges();
    const pendingChanges = new PendingChangesPage(page);
    await pendingChanges.waitForDrawer();
    const count = await pendingChanges.getChangeCount();
    expect(count).toBeGreaterThan(0);
  });
});
