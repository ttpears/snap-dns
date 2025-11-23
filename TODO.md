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

### Medium Priority

#### 3. **UX Improvements**
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

#### 4. **Snapshot Management**
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

#### 5. **Scheduled Automation**
   - [ ] Scheduled Automatic Snapshots
     - Hourly/daily snapshot schedule
     - Configurable per zone
     - Cron job or scheduler implementation

### Low Priority

#### 6. **Additional Features**
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

#### 7. **Backend Unit Tests**
   - [ ] Test TSIG key encryption/decryption
   - [ ] Test DNS service operations
   - [ ] Test backup service
   - [ ] Test user service
   - [ ] Test audit service

#### 8. **Integration Tests**
   - [ ] Full workflow tests
   - [ ] Multi-user scenarios
   - [ ] Permission boundary tests

#### 9. **Manual Testing Checklist**
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

#### 10. **Documentation Enhancements**
   - [ ] Add API documentation (OpenAPI/Swagger)
   - [ ] Create video tutorials
   - [ ] Add architecture diagrams
   - [ ] Create deployment guide for various platforms
   - [ ] Add troubleshooting flowcharts

### Performance & Monitoring

#### 11. **Performance Optimization**
   - [ ] Add caching layer for zone records
   - [ ] Optimize large zone handling
   - [ ] Add performance monitoring
   - [ ] Add metrics collection (Prometheus)

#### 12. **Observability**
   - [ ] Add structured logging
     - Currently uses console.log
     - Move to winston or pino
   - [ ] Add application metrics
   - [ ] Add distributed tracing
   - [ ] Add health check endpoints

### Infrastructure

#### 13. **Deployment Options**
   - [ ] Create Kubernetes manifests
   - [ ] Create Helm chart
   - [ ] Add AWS deployment guide
   - [ ] Add Azure deployment guide
   - [ ] Add GCP deployment guide

#### 14. **Database Migration**
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
