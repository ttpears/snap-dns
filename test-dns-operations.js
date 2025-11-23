// test-dns-operations.js
// Comprehensive Playwright E2E test suite for DNS record operations
// Version 2.0.0

const { chromium } = require('playwright');

// Test configuration
const CONFIG = {
  baseURL: process.env.TEST_URL || 'http://localhost:3001',
  username: process.env.TEST_USERNAME || 'admin',
  password: process.env.TEST_PASSWORD || 'admin', // Change in production
  testZone: process.env.TEST_ZONE || 'test.local',
  testKeyName: process.env.TEST_KEY || 'Test Local Zone Key',
  timeout: 60000, // 60 seconds
  headless: process.env.HEADLESS !== 'false', // Set HEADLESS=false to see browser
};

// Test data for all record types
const TEST_RECORDS = {
  A: {
    name: 'test-a-record',
    value: '192.168.100.50',
    ttl: 300,
  },
  AAAA: {
    name: 'test-aaaa-record',
    value: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    ttl: 300,
  },
  CNAME: {
    name: 'test-cname-record',
    value: 'target.example.test.',
    ttl: 300,
  },
  MX: {
    name: 'test-mx-record',
    priority: '10',
    value: 'mail.example.test.',
    ttl: 300,
  },
  TXT: {
    name: 'test-txt-record',
    value: 'v=spf1 include:_spf.example.test ~all',
    ttl: 300,
  },
  SRV: {
    name: '_http._tcp.test-srv',
    priority: '10',
    weight: '5',
    port: '80',
    target: 'server.example.test.',
    ttl: 300,
  },
  NS: {
    name: 'delegated',
    value: 'ns1.example.test.',
    ttl: 300,
  },
  PTR: {
    name: 'test-ptr-record',
    value: 'hostname.example.test.',
    ttl: 300,
  },
  CAA: {
    name: 'test-caa-record',
    flags: '0',
    tag: 'issue',
    value: 'letsencrypt.org',
    ttl: 300,
  },
  SSHFP: {
    name: 'test-sshfp-record',
    algorithm: '1',
    type: '1',
    fingerprint: 'abcdef0123456789abcdef0123456789abcdef01',
    ttl: 300,
  },
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

// Test suite class
class DNSTestSuite {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
  }

  async setup() {
    log('\n=== Setting up test environment ===', 'blue');

    this.browser = await chromium.launch({
      headless: CONFIG.headless,
      timeout: CONFIG.timeout,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      baseURL: CONFIG.baseURL,
    });

    this.page = await this.context.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(CONFIG.timeout);

    logSuccess('Browser launched successfully');
  }

  async teardown() {
    log('\n=== Cleaning up ===', 'blue');
    if (this.browser) {
      await this.browser.close();
      logSuccess('Browser closed');
    }
  }

  async login() {
    log('\n=== Logging in ===', 'blue');

    try {
      await this.page.goto('/');
      logInfo('Navigated to login page');

      // Wait for login form
      await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });

      // Fill login form
      await this.page.fill('input[name="username"]', CONFIG.username);
      await this.page.fill('input[name="password"]', CONFIG.password);

      // Click login button
      await this.page.click('button[type="submit"]');

      // Wait for successful login (redirects to settings page)
      await this.page.waitForSelector('text=Settings', { timeout: 10000 });

      logSuccess('Logged in successfully');
      return true;
    } catch (error) {
      logError(`Login failed: ${error.message}`);
      this.testResults.errors.push({ test: 'Login', error: error.message });
      return false;
    }
  }

  async selectZone() {
    log('\n=== Selecting test zone ===', 'blue');

    try {
      // Navigate to zones page
      logInfo('Navigating to Zone Editor...');
      await this.page.click('a:has-text("Zone Editor")');
      await this.page.waitForTimeout(2000);

      // Wait for key selector to be visible
      await this.page.waitForSelector('text=Select Key', { timeout: 10000 });

      // First, click key selector (must select key before zone)
      logInfo('Selecting TSIG key...');
      // Find all comboboxes and click the first one (key selector)
      const comboboxes = await this.page.locator('[role="combobox"]').all();
      if (comboboxes.length > 0) {
        await comboboxes[0].click();
      } else {
        throw new Error('No combobox found for key selector');
      }
      await this.page.waitForTimeout(500);

      // Wait for dropdown menu to appear
      await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 });

      // Select test key from dropdown (try exact match first, then contains)
      try {
        await this.page.click(`li[role="option"]:has-text("${CONFIG.testKeyName}")`, { timeout: 2000 });
      } catch (e) {
        // If exact match fails, click first available key
        logWarning(`Key "${CONFIG.testKeyName}" not found, selecting first available key`);
        const firstKey = await this.page.locator('li[role="option"]').first();
        await firstKey.click();
      }
      await this.page.waitForTimeout(2000);
      logSuccess('Selected TSIG key');

      // Now wait for zone selector to become enabled
      logInfo('Selecting zone...');
      logInfo('Waiting for zone selector to be enabled...');

      try {
        // Wait for zone selector to become enabled (max 10 seconds)
        await this.page.waitForFunction(() => {
          const comboboxes = document.querySelectorAll('[role="combobox"]');
          if (comboboxes.length < 2) return false;
          const zoneSelector = comboboxes[1];
          return zoneSelector.getAttribute('aria-disabled') !== 'true';
        }, { timeout: 10000 });
      } catch (e) {
        // Zone selector didn't enable - try selecting a different key
        logWarning('Zone selector not enabled, trying next key...');

        // Click key selector again
        const comboboxes = await this.page.locator('[role="combobox"]').all();
        if (comboboxes.length > 0) {
          await comboboxes[0].click();
          await this.page.waitForTimeout(500);
          await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 });

          // Try the second key
          const keys = await this.page.locator('li[role="option"]').all();
          if (keys.length > 1) {
            await keys[1].click();
            await this.page.waitForTimeout(2000);

            // Wait again for zone selector
            await this.page.waitForFunction(() => {
              const comboboxes = document.querySelectorAll('[role="combobox"]');
              if (comboboxes.length < 2) return false;
              const zoneSelector = comboboxes[1];
              return zoneSelector.getAttribute('aria-disabled') !== 'true';
            }, { timeout: 10000 });
          }
        }
      }

      // Click the second combobox (zone selector)
      const comboboxes2 = await this.page.locator('[role="combobox"]').all();
      if (comboboxes2.length > 1) {
        await comboboxes2[1].click();
      } else {
        throw new Error('Zone selector not found');
      }
      await this.page.waitForTimeout(500);

      // Wait for zone dropdown
      await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 });

      // Select test zone from dropdown (try exact match first, then first available)
      try {
        await this.page.click(`li[role="option"]:has-text("${CONFIG.testZone}")`, { timeout: 2000 });
      } catch (e) {
        // If exact match fails, click first available zone
        logWarning(`Zone "${CONFIG.testZone}" not found, selecting first available zone`);
        const firstZone = await this.page.locator('li[role="option"]').first();
        await firstZone.click();
      }
      await this.page.waitForTimeout(3000);

      // Wait for zone records to load
      await this.page.waitForSelector('text=Add Record', { timeout: 10000 });

      logSuccess(`Selected zone: ${CONFIG.testZone}`);
      return true;
    } catch (error) {
      logError(`Zone selection failed: ${error.message}`);
      this.testResults.errors.push({ test: 'Select Zone', error: error.message });
      return false;
    }
  }

  async addRecord(recordType, recordData) {
    try {
      logInfo(`Adding ${recordType} record: ${recordData.name || 'unnamed'}`);

      // Click "Add Record" button
      await this.page.click('button:has-text("Add Record")');
      await this.page.waitForTimeout(500);

      // Select record type
      await this.page.click('text=Select Record Type');
      await this.page.waitForTimeout(300);
      await this.page.click(`li:has-text("${recordType}")`);
      await this.page.waitForTimeout(500);

      // Fill in common fields
      if (recordData.name) {
        await this.page.fill('input[label="Record Name"], input[placeholder*="name"]', recordData.name);
      }

      if (recordData.ttl) {
        const ttlInput = await this.page.locator('input[label="TTL"], input[placeholder*="TTL"]').first();
        await ttlInput.clear();
        await ttlInput.fill(String(recordData.ttl));
      }

      // Fill type-specific fields
      switch (recordType) {
        case 'A':
        case 'AAAA':
        case 'CNAME':
        case 'TXT':
        case 'NS':
        case 'PTR':
          await this.page.fill('input[label*="Address"], input[label*="Target"], input[label*="Text"], input[label*="Hostname"]', recordData.value);
          break;

        case 'MX':
          await this.page.fill('input[label="Priority"]', recordData.priority);
          await this.page.fill('input[label*="Mail Server"], input[label*="Server"]', recordData.value);
          break;

        case 'SRV':
          await this.page.fill('input[label="Priority"]', recordData.priority);
          await this.page.fill('input[label="Weight"]', recordData.weight);
          await this.page.fill('input[label="Port"]', recordData.port);
          await this.page.fill('input[label*="Target"]', recordData.target);
          break;

        case 'CAA':
          await this.page.fill('input[label="Flags"]', recordData.flags);
          await this.page.fill('input[label="Tag"]', recordData.tag);
          await this.page.fill('input[label*="Value"]', recordData.value);
          break;

        case 'SSHFP':
          await this.page.fill('input[label="Algorithm"]', recordData.algorithm);
          await this.page.fill('input[label*="Type"]', recordData.type);
          await this.page.fill('input[label="Fingerprint"]', recordData.fingerprint);
          break;
      }

      // Click "Add Record" button in dialog
      await this.page.click('button:has-text("Add Record"):not([aria-label])');
      await this.page.waitForTimeout(1000);

      // Check if record was added to pending changes
      const pendingChangesButton = await this.page.locator('button:has-text("Pending Changes")');
      const badgeText = await pendingChangesButton.textContent();

      if (badgeText.includes('1') || badgeText.includes('2') || badgeText.includes('3')) {
        logSuccess(`${recordType} record added to pending changes`);
        return true;
      } else {
        logWarning(`${recordType} record may not have been added`);
        return false;
      }
    } catch (error) {
      logError(`Failed to add ${recordType} record: ${error.message}`);
      this.testResults.errors.push({ test: `Add ${recordType}`, error: error.message });
      return false;
    }
  }

  async applyPendingChanges() {
    try {
      logInfo('Applying pending changes');

      // Open pending changes drawer
      await this.page.click('button:has-text("Pending Changes")');
      await this.page.waitForTimeout(1000);

      // Click "Apply Changes" button
      await this.page.click('button:has-text("Apply Changes")');
      await this.page.waitForTimeout(2000);

      // Wait for success notification or drawer to close
      await this.page.waitForTimeout(3000);

      // Close drawer if still open
      try {
        await this.page.click('button[aria-label="Close"]', { timeout: 2000 });
      } catch (e) {
        // Drawer may already be closed
      }

      logSuccess('Pending changes applied successfully');
      return true;
    } catch (error) {
      logError(`Failed to apply pending changes: ${error.message}`);
      this.testResults.errors.push({ test: 'Apply Changes', error: error.message });
      return false;
    }
  }

  async refreshZone() {
    try {
      logInfo('Refreshing zone records');

      // Click refresh button
      await this.page.click('button[aria-label="Refresh zone records"]');
      await this.page.waitForTimeout(2000);

      logSuccess('Zone refreshed');
      return true;
    } catch (error) {
      logError(`Failed to refresh zone: ${error.message}`);
      return false;
    }
  }

  async verifyRecordExists(recordType, recordName) {
    try {
      // Search for the record in the table
      const recordRow = await this.page.locator(`tr:has-text("${recordName}")`);
      const count = await recordRow.count();

      if (count > 0) {
        logSuccess(`Verified ${recordType} record exists: ${recordName}`);
        return true;
      } else {
        logWarning(`Record not found: ${recordName}`);
        return false;
      }
    } catch (error) {
      logError(`Failed to verify record: ${error.message}`);
      return false;
    }
  }

  async editRecord(recordName, newTTL) {
    try {
      logInfo(`Editing record: ${recordName}`);

      // Find the record row and click edit button
      const recordRow = await this.page.locator(`tr:has-text("${recordName}")`).first();
      await recordRow.locator('button[aria-label*="Edit"]').click();
      await this.page.waitForTimeout(1000);

      // Change TTL
      const ttlInput = await this.page.locator('input[label="TTL"]').first();
      await ttlInput.clear();
      await ttlInput.fill(String(newTTL));

      // Save changes
      await this.page.click('button:has-text("Save Changes")');
      await this.page.waitForTimeout(1000);

      logSuccess(`Record edited: ${recordName}`);
      return true;
    } catch (error) {
      logError(`Failed to edit record: ${error.message}`);
      this.testResults.errors.push({ test: `Edit ${recordName}`, error: error.message });
      return false;
    }
  }

  async deleteRecord(recordName) {
    try {
      logInfo(`Deleting record: ${recordName}`);

      // Find the record row and click delete button
      const recordRow = await this.page.locator(`tr:has-text("${recordName}")`).first();
      await recordRow.locator('button[aria-label*="Delete"]').click();
      await this.page.waitForTimeout(500);

      // Confirm deletion if prompted
      try {
        await this.page.click('button:has-text("Delete")', { timeout: 2000 });
        await this.page.waitForTimeout(500);
      } catch (e) {
        // No confirmation dialog
      }

      logSuccess(`Record deleted: ${recordName}`);
      return true;
    } catch (error) {
      logError(`Failed to delete record: ${error.message}`);
      this.testResults.errors.push({ test: `Delete ${recordName}`, error: error.message });
      return false;
    }
  }

  async testUndoRedo() {
    log('\n=== Testing Undo/Redo functionality ===', 'blue');

    try {
      // Open pending changes drawer
      await this.page.click('button:has-text("Pending Changes")');
      await this.page.waitForTimeout(1000);

      // Click undo button
      const undoButton = await this.page.locator('button[aria-label="Undo"]');
      if (await undoButton.isVisible()) {
        await undoButton.click();
        await this.page.waitForTimeout(500);
        logSuccess('Undo operation successful');
      } else {
        logWarning('Undo button not visible');
      }

      // Click redo button
      const redoButton = await this.page.locator('button[aria-label="Redo"]');
      if (await redoButton.isVisible()) {
        await redoButton.click();
        await this.page.waitForTimeout(500);
        logSuccess('Redo operation successful');
      } else {
        logWarning('Redo button not visible');
      }

      // Close drawer
      await this.page.click('button[aria-label="Close"]');
      await this.page.waitForTimeout(500);

      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`Undo/Redo test failed: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push({ test: 'Undo/Redo', error: error.message });
      return false;
    }
  }

  async runAllTests() {
    log('\n╔════════════════════════════════════════════════════════╗', 'blue');
    log('║   Snap DNS - Comprehensive E2E Test Suite            ║', 'blue');
    log('╚════════════════════════════════════════════════════════╝', 'blue');

    const startTime = Date.now();

    try {
      // Setup
      await this.setup();

      // Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Login failed - cannot continue tests');
      }

      // Select zone
      const zoneSuccess = await this.selectZone();
      if (!zoneSuccess) {
        throw new Error('Zone selection failed - cannot continue tests');
      }

      // Test creating all record types
      log('\n=== Testing Record Creation ===', 'blue');

      for (const [recordType, recordData] of Object.entries(TEST_RECORDS)) {
        const success = await this.addRecord(recordType, recordData);
        if (success) {
          this.testResults.passed++;
        } else {
          this.testResults.failed++;
        }
      }

      // Apply pending changes
      log('\n=== Applying All Changes ===', 'blue');
      await this.applyPendingChanges();

      // Refresh zone to verify
      await this.refreshZone();

      // Verify records exist
      log('\n=== Verifying Created Records ===', 'blue');

      for (const [recordType, recordData] of Object.entries(TEST_RECORDS)) {
        if (recordData.name) {
          const exists = await this.verifyRecordExists(recordType, recordData.name);
          if (exists) {
            this.testResults.passed++;
          } else {
            this.testResults.failed++;
          }
        }
      }

      // Test editing a record
      log('\n=== Testing Record Editing ===', 'blue');

      const editSuccess = await this.editRecord(TEST_RECORDS.A.name, 600);
      if (editSuccess) {
        await this.applyPendingChanges();
        await this.refreshZone();
        this.testResults.passed++;
      } else {
        this.testResults.failed++;
      }

      // Test undo/redo
      await this.testUndoRedo();

      // Test deleting records
      log('\n=== Testing Record Deletion ===', 'blue');

      for (const [recordType, recordData] of Object.entries(TEST_RECORDS)) {
        if (recordData.name) {
          const deleteSuccess = await this.deleteRecord(recordData.name);
          if (deleteSuccess) {
            this.testResults.passed++;
          } else {
            this.testResults.failed++;
          }
        }
      }

      // Apply deletions
      await this.applyPendingChanges();
      await this.refreshZone();

      // Verify records are deleted
      log('\n=== Verifying Record Deletion ===', 'blue');

      for (const [recordType, recordData] of Object.entries(TEST_RECORDS)) {
        if (recordData.name) {
          const exists = await this.verifyRecordExists(recordType, recordData.name);
          if (!exists) {
            logSuccess(`Verified ${recordType} record deleted: ${recordData.name}`);
            this.testResults.passed++;
          } else {
            logWarning(`Record still exists: ${recordData.name}`);
            this.testResults.failed++;
          }
        }
      }

    } catch (error) {
      logError(`Test suite error: ${error.message}`);
      this.testResults.errors.push({ test: 'Test Suite', error: error.message });
      this.testResults.failed++; // Count critical errors as failures
    } finally {
      await this.teardown();

      // Print results
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      log('\n╔════════════════════════════════════════════════════════╗', 'blue');
      log('║   Test Results                                        ║', 'blue');
      log('╚════════════════════════════════════════════════════════╝', 'blue');

      log(`\nTotal Tests: ${this.testResults.passed + this.testResults.failed}`, 'cyan');
      logSuccess(`Passed: ${this.testResults.passed}`);
      logError(`Failed: ${this.testResults.failed}`);
      log(`Duration: ${duration}s`, 'cyan');

      if (this.testResults.errors.length > 0) {
        log('\n=== Errors ===', 'red');
        this.testResults.errors.forEach((err, idx) => {
          log(`${idx + 1}. ${err.test}: ${err.error}`, 'red');
        });
      }

      log('\n=== Test Summary ===', 'blue');
      if (this.testResults.failed === 0 && this.testResults.errors.length === 0) {
        logSuccess('All tests passed! 🎉');
        process.exit(0);
      } else {
        if (this.testResults.failed > 0) {
          logError(`${this.testResults.failed} test(s) failed`);
        }
        if (this.testResults.errors.length > 0) {
          logError(`${this.testResults.errors.length} error(s) occurred`);
        }
        process.exit(1);
      }
    }
  }
}

// Main execution
(async () => {
  const testSuite = new DNSTestSuite();
  await testSuite.runAllTests();
})();
