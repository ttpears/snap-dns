# GitHub Actions Workflows

This directory contains automated CI/CD workflows for Snap DNS.

## Workflows

### 1. E2E Tests (`e2e-tests.yml`)

**Purpose:** Automated end-to-end testing using Playwright

**Triggers:**
- Push to `main`, `feat/*`, `develop` branches
- Pull requests to `main`
- Manual workflow dispatch

**Steps:**
1. Start complete Docker test environment (BIND9 + Backend + Frontend)
2. Wait for services to be healthy
3. Install Playwright and Chromium
4. Run comprehensive E2E test suite (~52 tests)
5. Upload test artifacts on failure
6. Show logs on failure
7. Cleanup Docker containers

**Test Coverage:**
- All 11 DNS record types (A, AAAA, CNAME, MX, TXT, SRV, NS, PTR, CAA, SSHFP, SOA)
- CRUD operations (Create, Read, Update, Delete)
- Undo/redo functionality
- Bulk operations and zone refresh

**Duration:** ~3-5 minutes

**Docker Configuration:** Uses `docker-compose.ci.yml` (localhost-only)

### 2. Lint and Build (`lint-and-build.yml`)

**Purpose:** Code quality and build verification

**Triggers:**
- Push to `main`, `feat/*`, `develop` branches
- Pull requests to `main`
- Manual workflow dispatch

**Frontend Checks:**
1. TypeScript type checking (`tsc --noEmit`)
2. Production build (`npm run build`)
3. Build output verification

**Backend Checks:**
1. ESLint validation (`npm run lint`)
2. TypeScript type checking (`tsc --noEmit`)
3. Production build (`npm run build`)
4. Build output verification

**Duration:** ~2-3 minutes

## Configuration Files

### docker-compose.ci.yml
Simplified Docker Compose configuration for CI environments:
- Uses localhost instead of external hostnames
- No Traefik/proxy configuration
- Suitable for GitHub Actions runners
- Same services as `docker-compose.test.yml` but CI-optimized

### Test Environment Variables
All tests use safe defaults for CI:
```yaml
TEST_URL: http://localhost:3001
TEST_USERNAME: admin
TEST_PASSWORD: admin
TEST_ZONE: test.local
TEST_KEY: Test Local Zone Key
HEADLESS: true
```

## Viewing Results

### In GitHub UI
1. Go to repository → Actions tab
2. Select workflow (E2E Tests or Lint and Build)
3. Click on specific run to see details
4. Download artifacts for test failures

### Status Badges
Add to README.md:
```markdown
![E2E Tests](https://github.com/ttpears/snap-dns/workflows/E2E%20Tests/badge.svg)
![Lint and Build](https://github.com/ttpears/snap-dns/workflows/Lint%20and%20Build/badge.svg)
```

## Running Workflows Manually

### Via GitHub UI
1. Go to Actions tab
2. Select workflow
3. Click "Run workflow" button
4. Choose branch and click "Run workflow"

### Via GitHub CLI
```bash
# Trigger E2E tests
gh workflow run e2e-tests.yml

# Trigger lint and build
gh workflow run lint-and-build.yml

# View recent runs
gh run list --workflow=e2e-tests.yml
```

## Troubleshooting

### Tests failing in CI but passing locally

**Check Docker service startup:**
- Increase sleep time in "Start test environment" step
- Check container health status in logs

**Check Node.js version:**
- CI uses Node 18, ensure compatibility
- Update `node-version` in workflow if needed

**Check dependencies:**
- CI uses `npm ci` (clean install)
- May differ from local `npm install`
- Check package-lock.json is committed

### Build failing in CI but passing locally

**Check TypeScript version:**
- CI may use different version than local
- Lock version in package.json if needed

**Check environment variables:**
- CI uses REACT_APP_API_URL=http://localhost:3002
- Ensure no hardcoded URLs in code

### Artifacts not uploading

**Check paths in upload-artifact step:**
- Ensure paths exist before upload
- Use `if: always()` to upload even on failure

## Best Practices

1. **Keep workflows fast** - Current target: <5 minutes total
2. **Cache dependencies** - Use `cache: 'npm'` in setup-node action
3. **Fail fast** - Run quick checks (lint) before slow ones (E2E tests)
4. **Upload artifacts** - Always save test results on failure
5. **Clean up** - Always run cleanup step with `if: always()`

## Adding New Tests

When adding new test cases to `test-dns-operations.js`:

1. **Local testing first:**
   ```bash
   ./run-tests.sh
   ```

2. **Commit changes:**
   ```bash
   git add test-dns-operations.js
   git commit -m "test: add XYZ record type tests"
   ```

3. **Push to trigger CI:**
   ```bash
   git push
   ```

4. **Monitor in Actions tab** - Tests run automatically

## Customizing Workflows

### Changing test timeout
Edit `timeout-minutes` in workflow file:
```yaml
jobs:
  e2e-tests:
    timeout-minutes: 20  # Increase if tests are slow
```

### Adding more checks
Add new steps to workflow:
```yaml
- name: Security audit
  run: npm audit --production
```

### Running on different branches
Edit `on.push.branches`:
```yaml
on:
  push:
    branches: [ main, staging, production ]
```

## Cost Considerations

GitHub Actions includes:
- **2,000 minutes/month** for free (public repos)
- **Unlimited minutes** for public repos
- **Private repos:** 2,000 minutes/month on free tier

Current usage per run:
- E2E Tests: ~5 minutes
- Lint and Build: ~3 minutes
- **Total:** ~8 minutes per push

## Future Enhancements

- [ ] Add security scanning (npm audit, Snyk)
- [ ] Add code coverage reporting
- [ ] Add performance benchmarking
- [ ] Deploy preview environments
- [ ] Automatic release creation
- [ ] Docker image publishing
- [ ] Slack/Discord notifications

---

**Last Updated:** v2.0.0
**Status:** Active and monitoring all branches
