# Snap DNS v2.0

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A modern, enterprise-ready web-based DNS management interface for BIND9 DNS servers using nsupdate for dynamic DNS updates.

## Features

### Core Functionality
- ✅ **Full DNS Record Management** - Create, edit, delete 11 record types (A, AAAA, CNAME, MX, TXT, SRV, NS, PTR, CAA, SSHFP, SOA)
- ✅ **Atomic Updates** - All changes reviewed before application with undo/redo support
- ✅ **Automatic Snapshots** - Zone state captured before every change for easy rollback
- ✅ **Server-Side Persistence** - Snapshots and configuration stored securely on backend
- ✅ **Import/Export** - Snapshot and configuration backup/restore capabilities

### Security & Authentication
- ✅ **Session-Based Authentication** - Secure HTTP-only cookie sessions
- ✅ **Microsoft 365 SSO** - OAuth 2.0 integration with JIT user provisioning
- ✅ **Role-Based Access Control** - Admin, Editor, and Viewer roles
- ✅ **Azure AD Role Mapping** - Automatic role assignment from Entra ID app roles
- ✅ **Server-Side TSIG Keys** - Encrypted key storage (AES-256-CBC)
- ✅ **Audit Logging** - Complete history of all DNS and authentication operations

### User Experience
- ✅ **Modern React UI** - Material-UI components with dark/light themes
- ✅ **Real-Time Validation** - Client and server-side DNS record validation
- ✅ **Toast Notifications** - Non-intrusive success/error notifications
- ✅ **Advanced Search** - Filter and search through DNS records
- ✅ **Responsive Design** - Works on desktop and mobile devices
- ✅ **Hot Reload Development** - Sub-second iteration during development

### Administration
- ✅ **User Management UI** - Complete admin interface for user CRUD operations
- ✅ **Audit Log Viewer** - Filter, search, and export audit logs (CSV/JSON)
- ✅ **SSO Configuration UI** - Configure Microsoft 365 integration from web UI
- ✅ **Webhook Notifications** - Slack, Discord, Teams, Mattermost integrations
- ✅ **Teams Adaptive Cards** - Rich, mobile-friendly notification cards

## Quick Start

### Prerequisites
- Docker & Docker Compose
- BIND9 DNS server with TSIG keys configured
- Node.js 18+ (for development)

### Development Environment

```bash
# Clone repository
git clone https://github.com/ttpears/snap-dns.git
cd snap-dns

# Start test environment (includes BIND9 DNS server)
docker-compose -f docker-compose.test.yml up -d

# Access application
# Frontend: http://localhost:3001
# Backend API: http://localhost:3002
# Login: admin / admin (change on first login)
```

### Production Deployment

```bash
# Direct access (HTTP)
docker-compose -f docker-compose.prod.yml up -d

# With reverse proxy (HTTPS - recommended)
# 1. Configure reverse proxy (Traefik, Nginx, etc.)
# 2. Set environment variables:
export FRONTEND_URL=https://snap-dns.yourdomain.com
export ALLOWED_ORIGINS=https://snap-dns.yourdomain.com

# 3. Start containers
docker-compose -f docker-compose.prod.yml up -d
```

## Testing

### Automated E2E Tests

Comprehensive Playwright test suite covering all DNS operations:

```bash
# Run tests in headless mode
./run-tests.sh

# Run with browser visible (for debugging)
./run-tests.sh --headed

# Run with Playwright inspector
./run-tests.sh --debug
```

**Test Coverage:**
- All 11 DNS record types
- CRUD operations (Create, Read, Update, Delete)
- Undo/redo functionality
- Bulk operations
- Zone refresh
- ~52 test cases

**Environment Variables:**
```bash
TEST_URL=http://localhost:3001        # Test URL
TEST_USERNAME=admin                   # Test user
TEST_PASSWORD=admin                   # Test password (change in production)
TEST_ZONE=test.local                  # Test zone name
TEST_KEY="Test Local Zone Key"       # Test TSIG key name
HEADLESS=true                         # Run headless
```

See [TEST_DOCUMENTATION.md](TEST_DOCUMENTATION.md) for full testing guide.

## Configuration

### Environment Variables

#### Backend
```bash
BACKEND_PORT=3002                    # Server port
BACKEND_HOST=0.0.0.0                 # Server host
ALLOWED_ORIGINS=http://localhost:3001 # CORS origins
FRONTEND_URL=http://localhost:3001   # Frontend URL for SSO
NODE_ENV=production                  # Environment mode
SESSION_SECRET=<random-string>       # Session encryption key
```

#### Frontend
```bash
REACT_APP_API_URL=http://localhost:3002  # Backend API URL
PUBLIC_URL=/                              # Frontend public URL
WDS_SOCKET_HOST=localhost                 # WebSocket host
WDS_SOCKET_PORT=3001                      # WebSocket port
```

### TSIG Key Setup

TSIG keys are managed through the web UI (Settings → Keys). Keys are encrypted at rest using AES-256-CBC.

### Microsoft 365 SSO Setup

1. **Register Azure AD Application** (see [SSO_SETUP_GUIDE.md](SSO_SETUP_GUIDE.md))
2. **Configure in Web UI** (Settings → SSO):
   - Tenant ID, Client ID, Client Secret
3. **Configure App Roles** (see [ENTRA_ROLE_MAPPING_GUIDE.md](ENTRA_ROLE_MAPPING_GUIDE.md))
   - `admin`, `editor`, `viewer`

## Architecture

### Technology Stack

**Frontend:** React 18.2, Material-UI 5.13, TypeScript 5.7
**Backend:** Node.js, Express, TypeScript, BIND9 nsupdate/dig
**Database:** SQLite (users/sessions)
**Auth:** bcrypt, MSAL Node
**Infrastructure:** Docker, BIND9, Traefik/Nginx

### DNS Operations

**Supported Record Types:**
A, AAAA, CNAME, MX, TXT, SRV, NS, PTR, CAA, SSHFP, SOA

**Workflow:**
1. Select Zone & Key
2. Make Changes (tracked)
3. Review Changes (with undo/redo)
4. Apply Changes (atomic via nsupdate)
5. Auto-Snapshot (zone state saved)
6. Webhook Notify (optional)

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access - manage users, keys, zones, snapshots, audit logs, SSO config |
| **Editor** | Create, modify, delete DNS records and snapshots |
| **Viewer** | Read-only access to zones and records |

## Security Considerations

### ⚠️ Important Security Notes

**✅ Implemented in v2.0:**
- Server-side TSIG key storage (encrypted)
- Session-based authentication (HTTP-only cookies)
- Role-based access control
- Audit logging (all operations tracked)
- SSO integration (Microsoft 365)
- Real client IP logging (proxy-aware)

**⚠️ Recommended for Production:**
- Use HTTPS (reverse proxy with SSL)
- Configure Azure AD Conditional Access
- Enable MFA in Azure AD
- Implement rate limiting
- Use security headers (helmet.js)
- Network segmentation

See [CLAUDE.md](CLAUDE.md) for detailed security analysis.

## Monitoring & Operations

### Audit Logs

All operations logged with timestamp, user, client IP, event type, and status.

**Access:** Settings → Audit Logs (admin-only)
**Export:** CSV or JSON format

### Webhook Notifications

**Supported Providers:** Slack, Discord, Microsoft Teams, Mattermost
**Triggers:** DNS changes, snapshots, auth events, errors

### Health Monitoring

```bash
# Check backend health
curl http://localhost:3002/api/auth/status

# Check containers
docker-compose -f docker-compose.test.yml ps
docker logs snap-dns-test-backend
```

## Development

### Frontend Development

```bash
npm install
npm start              # Hot reload dev server
npm run build          # Production build
```

### Backend Development

```bash
cd backend
npm install
npm run dev            # Auto-reload dev server
npm run build          # Production build
npm start              # Run production
```

### Docker Development

```bash
# Hot reload mode (DEFAULT - fastest)
docker-compose -f docker-compose.test.yml up -d

# Production build mode
docker-compose -f docker-compose.test.prod.yml up -d --build
```

## Troubleshooting

### Common Issues

**Cannot connect to backend**
- Check CORS configuration (`ALLOWED_ORIGINS`)
- Verify `REACT_APP_API_URL` in frontend
- Check backend logs: `docker logs snap-dns-test-backend`

**TSIG authentication failed**
- Verify key matches BIND9 configuration
- Check key algorithm (usually HMAC-SHA256)
- Ensure key has update permissions for zone

**Session expires immediately**
- Check `SESSION_SECRET` is set
- Verify cookies are being set
- Check `FRONTEND_URL` matches actual URL

**SSO redirect URI mismatch**
- Ensure Azure AD redirect URI matches exactly
- Check `FRONTEND_URL` environment variable
- Use HTTPS in production (required for SSO)

**Zone selector disabled**
- Ensure selected TSIG key has zones assigned
- Check Settings → Keys to assign zones
- Admin users have access to all keys

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Architecture, security analysis
- **[TODO.md](TODO.md)** - Outstanding tasks
- **[TEST_DOCUMENTATION.md](TEST_DOCUMENTATION.md)** - Testing guide
- **[SSO_SETUP_GUIDE.md](SSO_SETUP_GUIDE.md)** - Azure AD setup
- **[ENTRA_ROLE_MAPPING_GUIDE.md](ENTRA_ROLE_MAPPING_GUIDE.md)** - Role configuration

## Version History

### v2.0.0 - Enterprise Ready
- ✨ Comprehensive E2E test suite (Playwright)
- ✨ Microsoft 365 SSO with JIT provisioning
- ✨ User management UI
- ✨ Audit log viewer with export
- ✨ Enhanced Teams Adaptive Cards
- ✨ Azure AD role mapping
- 🔒 Server-side TSIG keys (encrypted)
- 🔒 Session-based authentication
- 🔒 Role-based access control
- 🚀 Hot reload development (95% faster)
- 🚀 Snapshot import/export
- 🐛 Fixed zone selection persistence
- 🐛 Fixed snapshot restore
- 📚 Complete documentation

### v1.0.0 - Initial Release
- Core DNS record management
- Basic authentication
- Snapshot system
- Docker deployment

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## Support

- **Issues:** [GitHub Issues](https://github.com/ttpears/snap-dns/issues)
- **Documentation:** See docs above
- **Security:** Report security issues privately

---

**Built with ❤️ for modern DNS management**

**Version:** 2.0.0 | **Status:** Production Ready ✅
