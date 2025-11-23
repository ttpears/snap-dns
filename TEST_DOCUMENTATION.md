# Snap DNS - E2E Testing Documentation

## Overview

This document describes the comprehensive end-to-end (E2E) testing setup for Snap DNS using Playwright. The test suite exhaustively tests all DNS record types and operations (create, edit, delete).

## Test Files

- **`test-dns-operations.js`** - Main Playwright test script
- **`run-tests.sh`** - Bash script to run tests with proper setup
- **`test-package.json`** - Package dependencies for testing

## Prerequisites

1. **Test environment running**:
   ```bash
   docker-compose -f docker-compose.test.yml up -d
   ```

2. **Node.js installed** (v16 or higher)

3. **Playwright installed** (automatic via run-tests.sh)

## Running Tests

### Quick Start

```bash
# Run tests in headless mode (fastest)
./run-tests.sh

# Run with browser visible (for debugging)
./run-tests.sh --headed

# Run with Playwright inspector (step-by-step debugging)
./run-tests.sh --debug
```

### Manual Installation

```bash
# Install Playwright
npm install --no-save playwright

# Install Chromium browser
npx playwright install chromium

# Run tests
node test-dns-operations.js
```

### Environment Variables

- **`TEST_URL`** - Override the test URL (default: auto-detected or localhost:3001)
- **`HEADLESS`** - Set to `false` to show browser (default: true)
- **`PWDEBUG`** - Set to `1` for Playwright inspector

Examples:
```bash
# Test against specific URL
TEST_URL=http://yourhostname.example.com:3001 node test-dns-operations.js

# Show browser window
HEADLESS=false node test-dns-operations.js

# Debug with inspector
HEADLESS=false PWDEBUG=1 node test-dns-operations.js
```

## Test Coverage

### Record Types Tested

The test suite covers all 11 DNS record types:

1. **A** - IPv4 address records
2. **AAAA** - IPv6 address records
3. **CNAME** - Canonical name records
4. **MX** - Mail exchange records
5. **TXT** - Text records
6. **SRV** - Service records
7. **NS** - Name server records
8. **PTR** - Pointer records (reverse DNS)
9. **CAA** - Certification Authority Authorization
10. **SSHFP** - SSH fingerprint records
11. **SOA** - Start of Authority (read-only in tests)

### Operations Tested

For each record type (except SOA), the test suite performs:

1. **Create** - Add new DNS record
2. **Verify** - Confirm record exists after applying changes
3. **Edit** - Modify record TTL and other values
4. **Delete** - Remove record from zone
5. **Verify Deletion** - Confirm record no longer exists

### Additional Tests

- **Undo/Redo** - Test pending changes undo/redo functionality
- **Bulk Operations** - Apply multiple changes at once
- **Zone Refresh** - Verify zone data reload
- **Pending Changes** - Test change tracking drawer

## Test Data

Each record type has predefined test data:

```javascript
TEST_RECORDS = {
  A: { name: 'test-a-record', value: '192.168.100.50', ttl: 300 },
  AAAA: { name: 'test-aaaa-record', value: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', ttl: 300 },
  CNAME: { name: 'test-cname-record', value: 'target.example.test.', ttl: 300 },
  MX: { name: 'test-mx-record', priority: '10', value: 'mail.example.test.', ttl: 300 },
  TXT: { name: 'test-txt-record', value: 'v=spf1 include:_spf.example.test ~all', ttl: 300 },
  SRV: { name: '_http._tcp.test-srv', priority: '10', weight: '5', port: '80', target: 'server.example.test.', ttl: 300 },
  NS: { name: 'delegated', value: 'ns1.example.test.', ttl: 300 },
  PTR: { name: 'test-ptr-record', value: 'hostname.example.test.', ttl: 300 },
  CAA: { name: 'test-caa-record', flags: '0', tag: 'issue', value: 'letsencrypt.org', ttl: 300 },
  SSHFP: { name: 'test-sshfp-record', algorithm: '1', type: '1', fingerprint: 'abcdef0123456789abcdef0123456789abcdef01', ttl: 300 }
}
```

## Test Configuration

Edit `test-dns-operations.js` to customize:

```javascript
const CONFIG = {
  baseURL: 'http://localhost:3001',                // Test URL
  username: 'admin',                               // Login username
  password: 'admin',                               // Login password (change in production)
  testZone: 'test.local',                          // Zone to test
  testKeyName: 'Test Local Zone Key',              // TSIG key to use
  timeout: 60000,                                  // 60 second timeout
  headless: true,                                  // Run without UI
};
```

## Expected Output

Successful test run:
```
╔════════════════════════════════════════════════════════╗
║   Snap DNS - Comprehensive E2E Test Suite            ║
╚════════════════════════════════════════════════════════╝

=== Setting up test environment ===
✓ Browser launched successfully

=== Logging in ===
ℹ Navigated to login page
✓ Logged in successfully

=== Selecting test zone ===
✓ Selected zone: example.test

=== Testing Record Creation ===
ℹ Adding A record: test-a-record
✓ A record added to pending changes
ℹ Adding AAAA record: test-aaaa-record
✓ AAAA record added to pending changes
[... continues for all record types ...]

=== Applying All Changes ===
ℹ Applying pending changes
✓ Pending changes applied successfully

=== Verifying Created Records ===
✓ Verified A record exists: test-a-record
✓ Verified AAAA record exists: test-aaaa-record
[... continues for all records ...]

=== Testing Record Editing ===
ℹ Editing record: test-a-record
✓ Record edited: test-a-record

=== Testing Undo/Redo functionality ===
✓ Undo operation successful
✓ Redo operation successful

=== Testing Record Deletion ===
ℹ Deleting record: test-a-record
✓ Record deleted: test-a-record
[... continues for all records ...]

╔════════════════════════════════════════════════════════╗
║   Test Results                                        ║
╚════════════════════════════════════════════════════════╝

Total Tests: 52
✓ Passed: 52
✗ Failed: 0
Duration: 45.23s

=== Test Summary ===
✓ All tests passed! 🎉
```

## Troubleshooting

### Test environment not running

```bash
# Start the test environment
docker-compose -f docker-compose.test.yml up -d

# Verify containers are running
docker-compose -f docker-compose.test.yml ps
```

### Connection refused

- Check that frontend is accessible: `curl http://localhost:3001`
- Check that backend is accessible: `curl http://localhost:3002/api/auth/status`
- Verify ALLOWED_ORIGINS includes test hostname

### Login fails

- Verify credentials in CONFIG (default: admin/admin)
- Check backend logs: `docker logs snap-dns-test-backend`

### Records not appearing

- Verify zone selection is correct
- Check TSIG key has permissions for the zone
- Refresh zone manually to see if records exist

### Timeout errors

- Increase timeout in CONFIG (default: 60000ms)
- Check if services are slow to respond
- Run in headed mode to see what's happening: `./run-tests.sh --headed`

### Playwright not found

```bash
# Install Playwright
npm install --no-save playwright

# Install browser
npx playwright install chromium
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Start test environment
        run: docker-compose -f docker-compose.test.yml up -d

      - name: Wait for services
        run: sleep 10

      - name: Run E2E tests
        run: ./run-tests.sh

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

## Test Maintenance

### Adding New Test Cases

1. Add test data to `TEST_RECORDS` object
2. Add field handling in `addRecord()` method
3. Run tests to verify

### Modifying Test Flow

Edit the `runAllTests()` method to change test sequence:

```javascript
async runAllTests() {
  await this.setup();
  await this.login();
  await this.selectZone();

  // Add custom test steps here

  await this.teardown();
}
```

### Adding New Record Type Tests

When adding a new record type to the application:

1. Add to `TEST_RECORDS` with sample data
2. Add field handling logic in `addRecord()` switch statement
3. Update this documentation

## Performance Considerations

- **Headless mode** is ~30% faster than headed
- **Parallel execution** is not currently supported (serial tests only)
- **Test duration** varies by network speed (typically 30-60 seconds)
- **Browser caching** is disabled for consistency

## Best Practices

1. **Always run against test environment** - Never run against production
2. **Clean up after tests** - Tests create and delete records automatically
3. **Check logs on failure** - Use `--headed` or `--debug` modes
4. **Keep test data realistic** - Use valid DNS values
5. **Run tests before commits** - Catch regressions early

## Known Limitations

1. **SOA records** are not tested (read-only in UI)
2. **Snapshot operations** are not tested (separate test suite needed)
3. **Multi-user scenarios** are not tested
4. **Network failures** are not simulated
5. **Browser compatibility** - Only Chromium is tested

## Future Improvements

- [ ] Add snapshot creation/restore tests
- [ ] Add bulk delete operation tests
- [ ] Add search/filter functionality tests
- [ ] Add authentication flow tests (SSO)
- [ ] Add user management tests
- [ ] Add webhook notification tests
- [ ] Add parallel test execution
- [ ] Add screenshot capture on failure
- [ ] Add video recording of test runs
- [ ] Add performance benchmarking

## References

- [Playwright Documentation](https://playwright.dev/)
- [Snap DNS CLAUDE.md](./CLAUDE.md)
- [Snap DNS TODO.md](./TODO.md)
- [BIND9 nsupdate manual](https://bind9.readthedocs.io/en/latest/manpages.html#nsupdate-8)

---

**Version**: 2.0.0
