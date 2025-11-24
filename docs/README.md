# Snap DNS Documentation

Complete documentation for Snap DNS v2.0 - Enterprise DNS Management Interface

## Quick Links

| Document | Purpose | Audience |
|----------|---------|----------|
| [AUTHENTICATION.md](AUTHENTICATION.md) | Auth system, SSO, user management | Admins, Developers |
| [TESTING.md](TESTING.md) | E2E tests, test environment, manual testing | Developers, QA |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Dev workflow, hot reload, build modes | Developers |
| [ENTRA_SETUP.md](ENTRA_SETUP.md) | Azure AD / Microsoft 365 SSO configuration | Admins |
| [CHANGELOG.md](CHANGELOG.md) | Release notes, breaking changes, migration | All |

## Getting Started

### New Users
1. Start with [../README.md](../README.md) for overview and installation
2. Read [AUTHENTICATION.md](AUTHENTICATION.md) for login and user roles
3. See [TESTING.md](TESTING.md) for test environment credentials

### Developers
1. [DEVELOPMENT.md](DEVELOPMENT.md) - Set up development environment
2. [../CLAUDE.md](../CLAUDE.md) - Architecture and coding guidelines
3. [TESTING.md](TESTING.md) - Run E2E tests
4. [../TODO.md](../TODO.md) - Remaining tasks

### Administrators
1. [AUTHENTICATION.md](AUTHENTICATION.md) - User and role management
2. [ENTRA_SETUP.md](ENTRA_SETUP.md) - Configure Microsoft 365 SSO
3. [../README.md](../README.md) - Production deployment

---

## Document Summaries

### AUTHENTICATION.md
**Authentication & Authorization System**

- Session-based authentication (HTTP-only cookies)
- Microsoft 365 SSO integration (OAuth 2.0)
- User management (create, delete, modify)
- Role-based access control (Admin/Editor/Viewer)
- Per-user TSIG key access control
- API endpoints documentation
- Default credentials and security best practices

**Key Topics:**
- Login/logout flows
- Password management
- User roles and permissions
- SSO configuration
- Session management (24-hour duration)

### TESTING.md
**Comprehensive Testing Guide**

- Test environment architecture (Docker containers)
- Pre-configured test users and TSIG keys
- Automated E2E tests (Playwright, 52 test cases)
- Manual testing procedures
- Command-line DNS testing (dig, nsupdate)
- API testing with curl
- Docker operations and troubleshooting
- Remote access setup

**Key Topics:**
- Running E2E tests (`./run-tests.sh`)
- Test credentials (admin/admin, editor/editor123, viewer/viewer123)
- Testing all 11 DNS record types
- Permission testing
- Validation testing
- Troubleshooting guide

### DEVELOPMENT.md
**Development Workflow**

- Hot reload development mode (sub-2 second updates)
- Production build mode
- Docker Compose configurations
- Development vs production builds comparison
- Performance optimization tips
- Troubleshooting hot reload issues

**Key Topics:**
- `docker-compose.test.yml` - Hot reload (recommended)
- `docker-compose.test.prod.yml` - Production builds
- 95% faster development workflow
- Source code volume mounting
- WebSocket configuration

### ENTRA_SETUP.md
**Azure AD / Microsoft 365 SSO Configuration**

- Step-by-step app registration in Azure AD
- Creating app roles (admin/editor/viewer)
- Assigning users and groups to roles
- Token configuration for role claims
- Security group-based assignment
- Role mapping troubleshooting
- Conditional Access policies (optional)

**Key Topics:**
- App role creation (exact values: `admin`, `editor`, `viewer`)
- User/group assignment
- JIT (Just-In-Time) user provisioning
- Role claim troubleshooting
- Azure AD Premium features

### CHANGELOG.md
**Release Notes (v2.0)**

- Major features added in v2.0
- Breaking changes from v1.x
- Migration guide (v1.x → v2.0)
- Security improvements
- Bug fixes
- Known limitations
- Statistics (8000+ lines added, 50+ files changed)

**Key Topics:**
- Enterprise authentication & authorization
- Server-side encrypted TSIG keys
- Audit logging (11 event types)
- E2E testing infrastructure (52 tests)
- Webhook enhancements (Teams Adaptive Cards)
- Hot reload development mode

---

## Additional Resources

### In Project Root

| File | Description |
|------|-------------|
| [../README.md](../README.md) | Project overview, quick start, features |
| [../CLAUDE.md](../CLAUDE.md) | Architecture, development guidelines, troubleshooting |
| [../TODO.md](../TODO.md) | Remaining tasks, future enhancements |
| [../shared-types/README.md](../shared-types/README.md) | Shared TypeScript types documentation |

### External Resources

- [BIND9 Documentation](https://bind9.readthedocs.io/) - Official BIND9 docs
- [nsupdate Manual](https://bind9.readthedocs.io/en/latest/manpages.html#nsupdate-8) - Dynamic DNS updates
- [Material-UI](https://mui.com/) - React UI component library
- [Playwright](https://playwright.dev/) - E2E testing framework
- [Microsoft MSAL](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-overview) - Authentication library

---

## Documentation Index by Topic

### Authentication & Security
- [AUTHENTICATION.md](AUTHENTICATION.md) - Full auth system
- [ENTRA_SETUP.md](ENTRA_SETUP.md) - SSO configuration
- [../CLAUDE.md](../CLAUDE.md#security-considerations) - Security guidelines

### Testing & QA
- [TESTING.md](TESTING.md) - Complete testing guide
- [../CLAUDE.md](../CLAUDE.md#testing) - Test overview
- [../TODO.md](../TODO.md#testing-medium-priority) - Testing roadmap

### Development
- [DEVELOPMENT.md](DEVELOPMENT.md) - Dev workflow
- [../CLAUDE.md](../CLAUDE.md) - Architecture & guidelines
- [../shared-types/README.md](../shared-types/README.md) - Type system

### Deployment
- [../README.md](../README.md#production-deployment) - Production setup
- [../CLAUDE.md](../CLAUDE.md#production-deployment-checklist) - Deployment checklist
- [CHANGELOG.md](CHANGELOG.md#migration-guide) - Migration from v1.x

### API & Integration
- [AUTHENTICATION.md](AUTHENTICATION.md#api-endpoints) - Auth API
- [TESTING.md](TESTING.md#api-testing-with-curl) - API testing examples
- [../CLAUDE.md](../CLAUDE.md#authentication-flow) - API flow diagram

---

## Common Tasks

### I want to...

**...set up the development environment**
→ [DEVELOPMENT.md](DEVELOPMENT.md#quick-start-development-mode-fast-default)

**...run the automated tests**
→ [TESTING.md](TESTING.md#automated-e2e-tests)

**...configure Microsoft 365 SSO**
→ [ENTRA_SETUP.md](ENTRA_SETUP.md)

**...create a new user**
→ [AUTHENTICATION.md](AUTHENTICATION.md#user-management-endpoints-admin-only)

**...understand the architecture**
→ [../CLAUDE.md](../CLAUDE.md#architecture)

**...deploy to production**
→ [../README.md](../README.md#production-deployment)

**...add a new DNS record type**
→ [../CLAUDE.md](../CLAUDE.md#making-changes)

**...troubleshoot authentication issues**
→ [AUTHENTICATION.md](AUTHENTICATION.md#troubleshooting)

**...fix test environment issues**
→ [TESTING.md](TESTING.md#troubleshooting)

**...migrate from v1.x to v2.0**
→ [CHANGELOG.md](CHANGELOG.md#migration-guide)

---

## Documentation Standards

This documentation follows these principles:

1. **Accuracy** - Code references include file:line numbers
2. **Completeness** - Step-by-step instructions for all procedures
3. **Conciseness** - Tables and code blocks instead of long paragraphs
4. **Cross-referencing** - Links between related documents
5. **Examples** - Real, working examples for all commands
6. **Troubleshooting** - Common issues and solutions documented

---

## Contributing to Documentation

When updating documentation:

1. Keep it concise - use tables, bullet points, code blocks
2. Include working examples
3. Add troubleshooting sections
4. Cross-reference related docs
5. Update this index when adding new docs
6. Follow existing formatting conventions

---

## Support

**Questions?** Check the relevant doc above first, then:
1. Review [../CLAUDE.md](../CLAUDE.md#troubleshooting) troubleshooting section
2. Check existing GitHub issues
3. Open a new issue with:
   - What you're trying to do
   - What document you consulted
   - Steps to reproduce
   - Error messages and logs

---

**Documentation Version:** 2.0.0
**Last Updated:** 2025
**Status:** Production Ready
