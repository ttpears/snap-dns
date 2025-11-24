# Snap DNS v2.0.0 Release Notes

**Status:** Production Ready ✅

## 🎉 Major Features

### Enterprise Authentication & Authorization
- **Microsoft 365 SSO Integration** - OAuth 2.0 authorization code flow with MSAL Node
- **Just-In-Time (JIT) User Provisioning** - Automatic user creation on first SSO login
- **Azure AD Role Mapping** - Automatic role assignment from Entra ID app roles (admin/editor/viewer)
- **User Management UI** - Complete admin interface for CRUD operations on users
- **Session-Based Authentication** - Secure HTTP-only cookie sessions with bcrypt password hashing
- **Role-Based Access Control** - Three-tier permission system (admin, editor, viewer)

### Security Enhancements
- **Server-Side TSIG Keys** - Keys moved from localStorage to backend with AES-256-CBC encryption
- **Encrypted Storage** - SSO client secrets encrypted at rest
- **Audit Logging** - Complete history of all operations (11 event categories)
- **Audit Log Viewer** - Admin-only UI with filtering, search, CSV/JSON export
- **Real Client IP Logging** - Proxy-aware IP capture (X-Forwarded-For support)

### Testing Infrastructure
- **Comprehensive E2E Test Suite** - Playwright-based tests for all DNS operations
- **11 Record Types Coverage** - Tests for A, AAAA, CNAME, MX, TXT, SRV, NS, PTR, CAA, SSHFP, SOA
- **~52 Test Cases** - Full CRUD cycle testing with undo/redo validation
- **Automated Test Runner** - Shell script with auto-installation and environment detection
- **Flexible Configuration** - Environment variable support for test customization

### User Experience
- **Settings Tab Reorganization** - Split into 5 logical sections (General, Keys, Users, SSO, Audit Logs)
- **Toast Notification System** - Professional Material-UI Snackbar notifications replacing browser alerts
- **Zone Selection Persistence** - Fixed context bug where selections were lost on navigation
- **Hot Reload Development** - 95% faster iteration with webpack dev server integration
- **Snapshot Import** - Complete import/export functionality for zone snapshots

### Webhook & Notifications
- **Enhanced Teams Adaptive Cards** - Mobile-first design following Microsoft guidelines
- **Contextual Emoji Icons** - Visual indicators for different operation types
- **Action Buttons** - Direct links to zone details from notifications
- **Professional Formatting** - Hero headers, proper text wrapping, visual hierarchy

## 🔧 Bug Fixes

### Critical Fixes
- **Zone Selection Persistence** - Fixed KeyContext to wait for availableKeys before restoring from localStorage
- **Admin Key Access** - Admin users now get all key IDs for zone access (fixed 403 errors)
- **Snapshot Restore** - Intelligently handles ADD/MODIFY/DELETE operations for exact restoration
- **Record Comparison** - Uses exact matching (name + type + value) for multiple records with same name
- **TSIG Record Filtering** - Backend filters ephemeral TSIG records from zone transfers

### Minor Fixes
- **WebSocket Hot Reload** - Fixed webpack dev server to use FQDN instead of localhost
- **HTTPS Proxy Support** - Added ws:// → wss:// auto-upgrade for SSL-terminated proxies
- **SSO Redirect URIs** - Frontend URL properly passed to backend for dynamic redirect configuration

## 🚀 Performance Improvements

- **Hot Reload Mode** - Sub-second frontend rebuilds (vs 2-minute full rebuilds)
- **Lazy Loading** - Snapshots load on-demand rather than all at once
- **Server-Side Storage** - Moved from localStorage (5-10MB limit) to unlimited backend storage
- **Network Optimization** - Docker network changed from 172.30.0.0/24 to 10.100.0.0/24 (no conflicts)

## 📚 Documentation

### New Documentation
- **TEST_DOCUMENTATION.md** - Complete E2E testing guide with examples
- **ENTRA_ROLE_MAPPING_GUIDE.md** - Step-by-step Azure AD app role configuration
- **TEST_README.md** - Quick start for testing (consolidated into README.md in final)
- **Comprehensive README.md** - Complete rewrite with all features, architecture, and troubleshooting

### Updated Documentation
- **CLAUDE.md** - Updated with v2.0 features and security notes
- **TODO.md** - Cleaned to show only outstanding tasks (all completed items removed)
- **SSO_SETUP_GUIDE.md** - Enhanced with role mapping references

## 🔄 Breaking Changes

### Configuration Changes
- **TSIG Keys** - No longer stored in localStorage (automatic migration on first login)
- **Session Management** - New session-based auth requires SESSION_SECRET environment variable
- **Database** - SQLite database added for users and sessions (backend/data/)

### API Changes
- **Authentication Required** - All API endpoints now require authentication
- **Key Endpoints** - TSIG keys now managed via authenticated backend API
- **New Endpoints:**
  - `POST /api/auth/login` - Local authentication
  - `GET /api/auth/sso/signin` - Microsoft SSO initiation
  - `GET /api/auth/sso/callback` - SSO callback handler
  - `GET /api/auth/logout` - Session termination
  - `GET /api/auth/users` - User management (admin-only)
  - `GET /api/audit` - Audit log access (admin-only)

### Environment Variables
- **Frontend:**
  - `REACT_APP_API_URL` - Now required (previously optional with default)
  - `WDS_SOCKET_HOST` - Added for remote hot reload
  - `WDS_SOCKET_PORT` - Added for WebSocket configuration

- **Backend:**
  - `SESSION_SECRET` - **Required** for production
  - `FRONTEND_URL` - **Required** for SSO redirect URIs
  - `ALLOWED_ORIGINS` - Must include frontend URL for CORS

## 📦 Dependencies

### New Dependencies

**Frontend:**
- No new dependencies (only development workflow improvements)

**Backend:**
- `@azure/msal-node` v2.6.3 - Microsoft authentication library
- `express-session` v1.17.3 - Session management
- `bcrypt` v5.1.1 - Password hashing
- `better-sqlite3` v9.2.2 - Database for users/sessions

### Updated Dependencies
- `typescript` v5.7.2 (frontend) - Latest stable release
- All dependency versions reviewed and updated

## 🔐 Security Improvements

### High-Impact Changes
1. **TSIG Keys Server-Side** - Removed from browser storage (localStorage)
2. **Encrypted Key Storage** - AES-256-CBC encryption for TSIG keys at rest
3. **Session Cookies** - HTTP-only, secure cookies with proper SameSite handling
4. **Password Hashing** - bcrypt with salt rounds for local user passwords
5. **SSO Integration** - Enterprise-grade OAuth 2.0 with state token CSRF protection

### Security Recommendations
- Use HTTPS in production (reverse proxy with SSL termination)
- Configure Azure AD Conditional Access policies
- Enable MFA in Azure AD for all users
- Set strong SESSION_SECRET (minimum 32 characters, random)
- Review ALLOWED_ORIGINS to restrict CORS properly

## 🛠️ Migration Guide

### From v1.x to v2.0

#### Step 1: Update Environment Variables
```bash
# Add new required variables
export SESSION_SECRET=$(openssl rand -base64 32)
export FRONTEND_URL=https://snap-dns.yourdomain.com
export ALLOWED_ORIGINS=https://snap-dns.yourdomain.com
```

#### Step 2: Stop and Backup
```bash
# Stop containers
docker-compose down

# Backup localStorage data (export from Settings in v1.x)
# Keys and webhooks will need to be re-entered
```

#### Step 3: Pull and Start v2.0
```bash
git pull origin main
docker-compose -f docker-compose.prod.yml up -d
```

#### Step 4: Initial Setup
1. Login with default credentials (admin/admin)
2. Go to Settings → Keys and re-add TSIG keys
3. Go to Settings → General and configure webhooks
4. (Optional) Configure SSO in Settings → SSO
5. Create additional users in Settings → Users

#### Step 5: Verify
- Test DNS record operations
- Verify webhooks are working
- Check audit logs are recording
- Test SSO login if configured

## 🧪 Testing

### Running E2E Tests
```bash
# Ensure test environment is running
docker-compose -f docker-compose.test.yml up -d

# Run tests
./run-tests.sh

# With browser visible (debugging)
./run-tests.sh --headed
```

### Test Environment
- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:3002
- **DNS Server:** localhost:5353 (BIND9)
- **Test Zones:** test.local, example.test, demo.local

## 📊 Statistics

- **Lines of Code Added:** ~8,000+
- **Files Changed:** 50+
- **New Components:** 4 (UserManagement, SSOConfiguration, AuditLog, NotificationContext)
- **New Backend Routes:** 6 (auth, users, SSO, audit)
- **New Services:** 5 (authService, userService, msalService, auditService, ipHelpers)
- **Documentation Pages:** 5 new/updated
- **Test Coverage:** 11 record types, ~52 test cases

## 🎯 Known Limitations

1. **Rate Limiting** - Disabled in test/development environments
2. **SQLite Database** - Single-instance limitation (use PostgreSQL for multi-instance)
3. **Hot Reload over HTTPS** - Requires manual refresh (CRA limitation)
4. **E2E Tests** - Require proper key/zone configuration to pass
5. **SSO Providers** - Only Microsoft 365 supported (Google, Okta planned)

## 🔮 What's Next (v2.1+)

See [TODO.md](TODO.md) for full roadmap. Highlights:

- Request validation middleware (Joi/Zod)
- Security headers (helmet.js)
- Bulk snapshot operations
- Enhanced diff view
- Scheduled automatic snapshots
- Additional SSO providers
- Backend unit tests
- CI/CD pipeline integration

## 💬 Feedback & Support

- **Issues:** [GitHub Issues](https://github.com/ttpears/snap-dns/issues)
- **Discussions:** [GitHub Discussions](https://github.com/ttpears/snap-dns/discussions)
- **Security:** Report privately to maintainers

## 🙏 Acknowledgments

Special thanks to:
- BIND9 team for robust DNS server
- Material-UI for excellent React components
- Microsoft for MSAL Node library
- Playwright team for E2E testing framework
- All contributors and testers

---

**Upgrade Today!** 🚀

```bash
git pull origin main
docker-compose -f docker-compose.prod.yml up -d
```

---

**Version:** 2.0.0
**License:** MIT
**Maintained by:** Snap DNS Team
