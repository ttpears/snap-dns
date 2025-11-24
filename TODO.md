# Snap DNS v2.0 - TODO

## 🎯 Outstanding Tasks & Future Enhancements

### High Priority

#### 1. **Production Security Hardening**
   - [ ] Add request validation middleware (Joi/Zod)
   - [ ] Implement HTTPS enforcement
   - [ ] Add security headers (helmet.js)
   - [ ] Re-enable rate limiting for production
   - [ ] Configure Azure AD Conditional Access policies
   - [ ] Add password complexity requirements
   - [ ] Review and enhance input sanitization

#### 2. **E2E Test Suite Completion**
   - [ ] Verify test suite passes with proper key/zone configuration
   - [ ] Add snapshot creation/restore tests
   - [ ] Add user management operation tests
   - [ ] Add SSO login flow tests
   - [ ] Add webhook notification tests
   - [ ] Add error scenario tests
   - [ ] Integrate tests into CI/CD pipeline

#### 3. **API Key System for Programmatic Access** 🆕
   > Enable users to create API keys for programmatic DNS operations without using the GUI

   **Architecture Overview:**
   - API keys tied to user accounts and inherit their permissions
   - Secure key generation with format: `snap_<32-char-random>`
   - Keys hashed before storage (bcrypt, same as passwords)
   - Support dual authentication: session-based (GUI) + API key (programmatic)
   - Per-key rate limiting and usage tracking
   - Audit logging for all API key operations

   **Backend Implementation:**
   - [ ] Create API Key Types (backend/src/types/apiKey.ts)
     - `ApiKey` interface: id, userId, name, keyHash, scopes, createdAt, lastUsedAt, expiresAt
     - `ApiKeyCreateData` interface: name, scopes, expiresInDays
     - `ApiKeyResponse` interface: id, name, scopes, createdAt, lastUsedAt, expiresAt (no keyHash)
     - `ApiKeyScope` enum: READ (view zones/records), WRITE (modify DNS), ADMIN (manage keys/users)

   - [ ] Create API Key Service (backend/src/services/apiKeyService.ts)
     - Storage: `data/api-keys.json` (follows existing pattern)
     - `initialize()`: Load keys from disk, ensure data directory exists
     - `createApiKey(userId, data)`: Generate key, hash it, store metadata
     - `validateApiKey(plainKey)`: Find and validate key hash, update lastUsedAt
     - `listUserKeys(userId)`: Get all keys for a user (without hashes)
     - `deleteApiKey(keyId, userId)`: Delete key (verify ownership)
     - `rotateApiKey(keyId, userId)`: Generate new key, keep same metadata
     - `cleanupExpiredKeys()`: Periodic cleanup of expired keys
     - Key generation: `crypto.randomBytes(24).toString('base64url')` → `snap_<result>`

   - [ ] Create API Key Auth Middleware (backend/src/middleware/apiKeyAuth.ts)
     - `authenticateRequest()`: Check both session AND Authorization header
     - Extract "Authorization: Bearer snap_..." header
     - Validate and attach user/permissions to request
     - Update lastUsedAt timestamp on successful auth
     - Return 401 for invalid/expired keys with clear error messages

   - [ ] Create API Key Routes (backend/src/routes/apiKeyRoutes.ts)
     - `POST /api/api-keys`: Create new API key (requires session auth)
       - Request: `{ name, scopes, expiresInDays? }`
       - Response: `{ key: "snap_...", metadata: {...} }` (key shown only once!)
     - `GET /api/api-keys`: List user's API keys (requires session auth)
       - Response: Array of ApiKeyResponse (no key values)
     - `DELETE /api/api-keys/:id`: Delete API key (requires session auth)
     - `POST /api/api-keys/:id/rotate`: Rotate key (requires session auth)
       - Response: New key value (shown only once!)
     - Add requireAuth middleware to all endpoints

   - [ ] Update Authentication Middleware (backend/src/middleware/auth.ts)
     - Modify `requireAuth()` to check BOTH session and API key
     - Priority: session first, then API key
     - For API key auth: validate key, load user, attach to request
     - Ensure all existing routes continue to work with session auth

   - [ ] Update Rate Limiter (backend/src/middleware/rateLimiter.ts)
     - Add per-API-key rate limiting
     - Different limits for READ vs WRITE operations
     - Track usage by keyId in addition to IP

   - [ ] Update Audit Service (backend/src/services/auditService.ts)
     - Log API key creation/deletion/rotation
     - Log API key authentication attempts (success/failure)
     - Include API key ID (not value!) in audit logs for API requests
     - Track which operations were performed via API key vs session

   - [ ] Add API Key Management to Server Initialization (backend/src/server.ts)
     - Initialize apiKeyService on startup
     - Mount API key routes at `/api/api-keys`
     - Schedule periodic cleanup of expired keys

   **Frontend Implementation:**
   - [ ] Create API Key Types (src/types/apiKey.ts)
     - Mirror backend types (without keyHash)
     - Frontend-specific types for UI state

   - [ ] Create API Key Service (src/services/apiKeyService.ts)
     - HTTP client wrapper for API key endpoints
     - `createApiKey(name, scopes, expiresInDays)`
     - `listApiKeys()`
     - `deleteApiKey(keyId)`
     - `rotateApiKey(keyId)`

   - [ ] Create API Key Management UI (src/components/APIKeyManagement.tsx)
     - List view: table with columns (Name, Scopes, Created, Last Used, Expires, Actions)
     - Create dialog: form with name input, scope checkboxes, expiration dropdown
     - Key display modal: show key ONCE after creation with copy button and warning
     - Delete confirmation dialog
     - Rotate confirmation dialog (shows new key once)
     - Empty state: "No API keys. Create one to access the API programmatically."
     - Admin-only visibility (or show user's own keys if not admin)

   - [ ] Add API Key Management to Settings (src/components/Settings.tsx)
     - New tab/section: "API Keys"
     - Render APIKeyManagement component
     - Only visible to authenticated users

   - [ ] Add API Key Context (src/context/ApiKeyContext.tsx) [OPTIONAL]
     - May not be needed - can use service directly
     - Only implement if global state is beneficial

   **Documentation:**
   - [ ] Create API Documentation (API_DOCUMENTATION.md)
     - Authentication methods (session vs API key)
     - API key format and usage
     - Example requests with curl/httpie/JavaScript
     - All endpoints with request/response schemas
     - Rate limiting information
     - Security best practices

   - [ ] Update README.md
     - Add "API Access" section
     - Link to API documentation
     - Quick example of API key usage

   - [ ] Update CLAUDE.md
     - Document API key architecture
     - Add to security considerations
     - Include in authentication flow documentation

   **Testing:**
   - [ ] Backend Unit Tests (backend/src/services/apiKeyService.test.ts)
     - Test key generation and uniqueness
     - Test key validation and hashing
     - Test expiration logic
     - Test rotation logic

   - [ ] Backend Integration Tests
     - Test API key authentication flow
     - Test permission inheritance from user
     - Test rate limiting per key
     - Test expired key rejection

   - [ ] E2E Tests (test/api-key-operations.test.js)
     - Create API key via UI
     - Use API key to perform DNS operations
     - Verify audit logs capture API key usage
     - Test key rotation and deletion

   **Security Considerations:**
   - ✅ Keys are hashed before storage (bcrypt)
   - ✅ Keys shown only once at creation
   - ✅ Keys transmitted via Authorization header (not query params)
   - ✅ Keys tied to user accounts with existing RBAC
   - ✅ Rate limiting prevents abuse
   - ✅ Audit logging for accountability
   - ⚠️ Requires HTTPS in production (already noted in TODO #1)
   - ⚠️ Consider key rotation policies (manual for now)
   - ⚠️ Consider alerting on suspicious API key usage

   **Example Usage:**
   ```bash
   # Create an API key via UI, copy the key shown once

   # List zones
   curl -H "Authorization: Bearer snap_abc123..." \
     https://your-server/api/zones

   # Add a DNS record
   curl -X POST \
     -H "Authorization: Bearer snap_abc123..." \
     -H "Content-Type: application/json" \
     -d '{"name":"test","type":"A","ttl":3600,"value":"192.0.2.1"}' \
     https://your-server/api/zones/example.com/records

   # Delete a record
   curl -X DELETE \
     -H "Authorization: Bearer snap_abc123..." \
     -H "Content-Type: application/json" \
     -d '{"name":"test","type":"A","value":"192.0.2.1"}' \
     https://your-server/api/zones/example.com/records
   ```

### Medium Priority

#### 4. **UX Improvements**
   - [ ] Bulk Snapshot Operations
     - Delete multiple snapshots at once
     - Export multiple snapshots
     - Checkbox selection in snapshot list

   - [ ] Enhanced Diff View
     - Side-by-side comparison view
     - Syntax highlighting for record values
     - Better formatting for SOA/MX/SRV records
     - Collapse/expand all changes

   - [ ] Zone Editor Enhancements
     - Bulk record operations (delete multiple)
     - Import/export zone files (BIND format)
     - Record templates for common patterns
     - Advanced validation improvements

#### 5. **Snapshot Management**
   - [ ] Snapshot Retention Policies
     - Configurable auto-delete of old snapshots
     - Currently fixed at 50 snapshots per zone
     - Add UI for retention settings

   - [ ] Snapshot Tags/Labels
     - Add tags to snapshots for organization
     - Filter by tags
     - Common tags: "pre-migration", "stable", "tested"

   - [ ] Direct Rollback Feature
     - Restore snapshot directly without pending changes
     - One-click rollback for emergencies
     - With confirmation dialog

#### 6. **Scheduled Automation**
   - [ ] Scheduled Automatic Snapshots
     - Hourly/daily snapshot schedule
     - Configurable per zone
     - Cron job or scheduler implementation

### Low Priority

#### 7. **Additional Features**
   - [ ] Email Notifications
     - SMTP support for critical changes
     - Currently only webhook notifications

   - [ ] Additional SSO Providers
     - Google Workspace
     - Okta
     - Other SAML providers

   - [ ] Advanced RBAC
     - Fine-grained permissions per zone/key
     - Custom role definitions
     - Zone-specific access controls

### Testing Needs

#### 8. **Backend Unit Tests**
   - [ ] Test TSIG key encryption/decryption
   - [ ] Test DNS service operations
   - [ ] Test backup service
   - [ ] Test user service
   - [ ] Test audit service

#### 9. **Integration Tests**
   - [ ] Full workflow tests
   - [ ] Multi-user scenarios
   - [ ] Permission boundary tests

#### 10. **Manual Testing Checklist**
   - [ ] Test all record types (PTR, CAA, SSHFP not thoroughly tested)
   - [ ] Test undo/redo functionality extensively
   - [ ] Test bulk delete operations
   - [ ] Test Teams Adaptive Cards with real webhook
   - [ ] Test with multiple concurrent users
   - [ ] Test session expiration handling
   - [ ] Test network failures and retries
   - [ ] Test SSO role mapping from Azure AD
   - [ ] Test SSO with multiple users
   - [ ] Test real client IP logging through reverse proxy

### Documentation

#### 11. **Documentation Enhancements**
   - [ ] Add API documentation (OpenAPI/Swagger)
   - [ ] Create video tutorials
   - [ ] Add architecture diagrams
   - [ ] Create deployment guide for various platforms
   - [ ] Add troubleshooting flowcharts

### Performance & Monitoring

#### 12. **Performance Optimization**
   - [ ] Add caching layer for zone records
   - [ ] Optimize large zone handling
   - [ ] Add performance monitoring
   - [ ] Add metrics collection (Prometheus)

#### 13. **Observability**
   - [ ] Add structured logging
     - Currently uses console.log
     - Move to winston or pino
   - [ ] Add application metrics
   - [ ] Add distributed tracing
   - [ ] Add health check endpoints

### Infrastructure

#### 14. **Deployment Options**
   - [ ] Create Kubernetes manifests
   - [ ] Create Helm chart
   - [ ] Add AWS deployment guide
   - [ ] Add Azure deployment guide
   - [ ] Add GCP deployment guide

#### 15. **Database Migration**
   - [ ] Consider PostgreSQL for production
     - Currently using SQLite
     - Better for multi-instance deployments
   - [ ] Add database migration tooling
   - [ ] Add backup/restore scripts

---

## 📊 Project Status

**Version:** 2.0.0
**Status:** Production Ready ✅

### Core Features Status
- ✅ DNS Record Management (all 11 types)
- ✅ Authentication & Authorization (session + SSO)
- ✅ User Management UI
- ✅ Audit Logging with Viewer
- ✅ Snapshot System (server-backed)
- ✅ Webhook Notifications (4 providers)
- ✅ E2E Test Suite (infrastructure complete)
- ✅ Hot Reload Development Mode
- ✅ Comprehensive Documentation

### Production Readiness Checklist
- ✅ Session-based authentication
- ✅ Role-based access control
- ✅ Server-side TSIG keys (encrypted)
- ✅ Audit logging (complete history)
- ✅ SSO integration (Microsoft 365)
- ⚠️ HTTPS (requires reverse proxy setup)
- ⚠️ Rate limiting (disabled in dev/test)
- ⚠️ Security headers (not implemented)
- ⚠️ Request validation middleware (not implemented)
- ⚠️ CI/CD pipeline (not configured)

---

## 🚀 Getting Started

See [README.md](README.md) for quick start guide.

## 📚 Documentation

- **[README.md](README.md)** - Quick start and overview
- **[CLAUDE.md](CLAUDE.md)** - Architecture and security details
- **[TEST_DOCUMENTATION.md](TEST_DOCUMENTATION.md)** - E2E testing guide
- **[SSO_SETUP_GUIDE.md](SSO_SETUP_GUIDE.md)** - Azure AD configuration
- **[ENTRA_ROLE_MAPPING_GUIDE.md](ENTRA_ROLE_MAPPING_GUIDE.md)** - Role mapping guide

---

## 🤝 Contributing

Contributions are welcome! Please see the outstanding tasks above for areas that need work.

1. Pick a task from this TODO
2. Create an issue (if one doesn't exist)
3. Fork and create a feature branch
4. Make your changes with tests
5. Submit a pull request

---

## 📧 Support

For questions or issues with outstanding tasks, please open a GitHub issue.

---

**Next Recommended Actions:**
1. Configure Azure AD app roles for SSO role mapping
2. Set up reverse proxy with SSL for HTTPS
3. Verify E2E tests pass with proper environment setup
4. Implement production security hardening checklist
5. Add CI/CD pipeline for automated testing
