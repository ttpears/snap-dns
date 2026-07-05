# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Snap DNS is a web-based DNS management interface for managing DNS zones and records using BIND's nsupdate utility. It consists of a React frontend and an Express/TypeScript backend that interfaces with DNS servers via TSIG authentication.

## Commands

### Frontend Development
```bash
# Type check without building
npm run build  # Runs tsc --noEmit first, then builds

# Start development server
npm start

# Production build and serve
npm run build
npm run serve:prod
```

### Backend Development
```bash
cd backend

# Development with auto-reload
npm run dev

# Production build
npm run build
npm start

# Linting and testing
npm run lint
npm test
```

### Docker Operations
```bash
# Local development
docker-compose up --build -d

# Test environment (with mock DNS server)
./test-setup.sh
# OR manually:
docker-compose -f docker-compose.test.yml up --build -d

# Production (direct access)
docker-compose -f docker-compose.prod.yml up -d

# Production (with Traefik proxy - uncomment labels in docker-compose.prod.yml)
# Set FQDN and FQDN_API environment variables
docker-compose -f docker-compose.prod.yml up -d

# Available compose configurations:
# - docker-compose.yml - Local development (hot reload)
# - docker-compose.test.yml - Complete test stack with BIND9 DNS server
# - docker-compose.prod.yml - Production with optional Traefik proxy support
```

## Versioning & Releases

The project uses semantic versioning. Both `package.json` (root) and `backend/package.json` must stay in sync.

### Version Bump Workflow
```bash
# Bump and tag (updates both package.json files, commits, creates git tag)
./scripts/bump-version.sh patch   # 2.1.0 → 2.1.1
./scripts/bump-version.sh minor   # 2.1.0 → 2.2.0
./scripts/bump-version.sh major   # 2.1.0 → 3.0.0
./scripts/bump-version.sh 2.5.0   # explicit version

# Push the commit and tag to trigger the Docker publish workflow
git push origin HEAD && git push origin v<version>
```

### Docker Image Tags

The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) publishes to GHCR on:
- **Push to `main`**: tags images with `main`, `latest`, and short SHA
- **Push of `v*` tag**: tags images with the semver version (e.g., `2.1.0`)

Images: `ghcr.io/ttpears/snap-dns-frontend` and `ghcr.io/ttpears/snap-dns-backend`

Production compose (`docker-compose.prod.yml`) uses `${IMAGE_TAG:-latest}` — set `IMAGE_TAG=2.1.0` to pin a specific release.

## Architecture

### Frontend Structure

The frontend is a React application with Material-UI components and follows a context-based state management pattern:

**Context Providers (Nested in App.tsx):**
- `ThemeProvider` - Dark/light mode theming
- `NotificationProvider` - Snackbar UI notifications
- `AuthProvider` - Session authentication state (user, role, login/logout); unauthenticated users see `Login` instead of the app
- `ConfigProvider` - Application settings (localStorage-backed for TTL/display settings and a legacy `keys` field; webhook config is loaded from and saved to the backend `/api/webhook-config`)
- `KeyProvider` - TSIG keys fetched from the backend (`/api/tsig-keys`); only the current key/zone selection is persisted to localStorage
- `ZoneProvider` - Mounted in App.tsx but has no consumers (`useZone` is unused — effectively dead code)
- `PendingChangesProvider` - Tracks queued DNS record changes (flat list; no undo/redo)

**Key Services (src/services/):**
- `dnsService.ts` - Frontend HTTP client for DNS operations (session-cookie auth; includes `applyBatch` for atomic per-zone bulk apply)
- `authService.ts` - Login/logout/session/change-password API client
- `tsigKeyService.ts` - TSIG key management API client (`/api/tsig-keys`)
- `backupService.ts` - API client for server-side snapshots (`/api/backups`): create, compare, restore
- `auditService.ts` / `userService.ts` - Audit log and user management API clients (admin)
- `notificationService.ts` - Multi-provider webhook notifications (Slack, Discord, Teams, Mattermost)
- `dnsValidationService.ts` - Client-side record validation
- `dnsRecordFormatter.ts` - Record formatting and parsing utilities

**Main Components:**
- `AppContent` - Main layout and routes: `/zones` (ZoneEditor), `/snapshots` (Snapshots), `/settings` (Settings)
- `Login` - Username/password and SSO sign-in
- `ZoneEditor` - Zone record table plus add/edit record forms (`AddDNSRecord`, `RecordEditor`)
- `Snapshots` - Server-side backup create/compare/restore UI
- `Settings` - Tabbed UI: General, Keys (`TSIGKeyManagement`), Users (`UserManagement`), SSO (`SSOConfiguration`), Audit Logs (`AuditLog`, admin-only)

### Backend Structure

The backend is an Express TypeScript application that executes DNS operations:

**Entry Point:** `backend/src/server.ts`
- Session middleware (`express-session` with a file store under `data/sessions`, httpOnly cookies)
- CORS configuration with environment-specific allowed origins
- Middleware: logging, JSON parsing (10mb limit), DNS message parsing, global API rate limiting
- Routes mounted at `/api/auth`, `/api/auth/sso`, `/api/tsig-keys`, `/api/zones`, `/api/keys` (legacy no-op stub), `/api/webhook`, `/api/backups`, `/api/webhook-config`, `/api/sso-config`, `/api/audit`
- Initializes user, TSIG key, backup, webhook-config, and SSO-config services at startup; all persist JSON under `data/`

**Middleware (backend/src/middleware/):**
- `auth.ts` - `requireAuth`, `requireRole`, `requireKeyAccess`, `requireWriteAccess` (roles: admin/editor/viewer)
- `rateLimiter.ts` - express-rate-limit instances (general API, DNS query/modify, key management, webhook, login)
- `validation.ts` - Zod request schemas (DNS records, login, change-password, TSIG key create/update)

**Services (backend/src/services/):**
- `dnsService.ts` - Executes `nsupdate` and `dig` commands via child_process
  - `fetchZoneRecords()` - Uses `dig AXFR` to fetch zone records
  - `addRecord()`/`deleteRecord()`/`updateRecord()`/`applyBatch()` - Create temporary nsupdate files and execute them (batch = one atomic transaction per zone)
  - Record normalization and deduplication logic
- `tsigKeyService.ts` - Server-side TSIG key storage, AES-256-CBC encrypted at rest (`data/tsig-keys.json`)
- `userService.ts` - Local user accounts with bcrypt password hashes (`data/users.json`)
- `backupService.ts` - Server-side zone backups (`data/backups/`, capped per zone)
- `auditService.ts` - Persistent audit log (JSON lines appended to `data/audit.log`)
- `validationService.ts` / `dnsSafety.ts` / `dnsPresentation.ts` - Server-side record validation, name/injection guards, display formatting
- `webhookConfigService.ts` / `ssoConfigService.ts` / `msalService.ts` - Server-side webhook config, SSO config, and Microsoft Entra ID (MSAL) integration
- `webhookService.ts` - Webhook notification dispatch
- `keyService.ts` - Legacy stub (no-op; superseded by `tsigKeyService.ts`)

**Routes:**
- `zoneRoutes.ts` - GET `/api/zones/:zone`, POST/DELETE/PATCH `/api/zones/:zone/records`, POST `/api/zones/:zone/records/batch` — all require auth and are rate limited; TSIG keys are resolved server-side per zone
- `authRoutes.ts` / `ssoAuthRoutes.ts` - Login, logout, session, change-password; admin-only user CRUD; Entra ID SSO flow
- `tsigKeyRoutes.ts` - TSIG key CRUD (rate limited; delete is admin-only)
- `backupRoutes.ts` - Server-side zone backup CRUD
- `webhookConfigRoutes.ts` / `ssoConfigRoutes.ts` - Server-side webhook and SSO configuration (SSO config admin-only)
- `auditRoutes.ts` - Audit log queries (admin-only)
- `webhookRoutes.ts` - Webhook testing
- `keyRoutes.ts` - Legacy no-op stub

### Type System

The project uses shared TypeScript types between frontend and backend:

**Core Types (duplicated in both `src/types/` and `backend/src/types/`):**
- `dns.ts` - DNSRecord, PendingChange, ZoneConfig, RecordType enum
- `config.ts` - Application configuration interfaces
- `keys.ts` - TSIG key configuration
- `webhook.ts` - Webhook provider types
- Frontend-only: `audit.ts`; backend-only: `auth.ts`, `sso.ts`

**Important:** When modifying types, ensure changes are synchronized between frontend and backend type definitions.

### DNS Operations Flow

1. User logs in (local account or SSO); the session cookie authenticates all subsequent requests
2. User selects zone and modifies records in the UI
3. Changes are tracked in `PendingChangesContext` (flat queue; individual changes can be removed)
4. When applied (after a confirmation dialog), frontend `dnsService.applyBatch()` sends one batch request per zone — no TSIG material is sent; the backend resolves the zone's TSIG key from its encrypted server-side store
5. Backend validates every record, creates a temporary nsupdate command file, and executes `nsupdate` as a single atomic transaction per zone
6. The change is written to the audit log and webhooks are triggered
7. Zone records are refreshed via `dig AXFR`

### Record Type Handling

The application handles special formatting for:
- **SOA records**: Parsed into structured objects with `{mname, rname, serial, refresh, retry, expire, minimum}`
- **MX records**: Format: `priority target` (e.g., "10 mail.example.com")
- **SRV records**: Format: `priority weight port target`
- **TXT records**: Automatically quoted and escaped
- **PTR records**: Reverse DNS with automatic formatting

### Configuration and State

**Frontend Configuration (localStorage: 'dns_manager_config'):**
- Default TTL and display settings
- Legacy `keys` field (superseded by server-side TSIG keys, but still read as a fallback and writable via the Settings import flow)
- Webhook config is no longer stored here — it lives server-side (`/api/webhook-config`)

**Backend Configuration (Environment Variables):**
- `BACKEND_PORT` - Server port (default: 3002)
- `BACKEND_HOST` - Server host (default: 0.0.0.0)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins
- `NODE_ENV` - Environment mode (development allows all CORS)
- `MAX_REQUEST_SIZE` - Request size limit (default: 10mb)
- `TEMP_DIR` - Temporary file directory (default: /tmp/snap-dns)
- `SESSION_SECRET` - Session cookie signing secret
- `TSIG_ENCRYPTION_KEY` - Key used to encrypt stored TSIG secrets at rest

**Backend Persistent State (`data/` directory):**
- `sessions/`, `users.json`, `tsig-keys.json`, `backups/`, `audit.log`, `webhook-configs.json`, `sso-config.json`

**Frontend Environment Variables:**
- `REACT_APP_API_URL` - Backend API URL
- `PUBLIC_URL` - Frontend public URL
- `WDS_SOCKET_PORT` - Webpack dev server socket port

## ⚠️ Problematic Design Decisions

**WARNING**: Earlier versions of this application had significant security and architectural issues. Many have since been resolved (struck-through items below); the remaining open items should be addressed before production use.

### Summary of Open Issues
- **Security**: A legacy localStorage `keys` field and Settings import path can still hold TSIG key material (see #1); logging has not been fully audited for sensitive data
- **Code Organization**: Duplicate type definitions between frontend and backend (no shared-types package exists)
- **Operational**: Dev/test CORS allows all origins; whole zones are deduplicated in memory

### 🔴 Critical Security Issues

1. **Legacy TSIG Keys in localStorage** (src/context/KeyContext.tsx:65, src/components/Settings.tsx:356-372)
   - Primary key storage is now server-side and encrypted (`tsigKeyService`), and the UI no longer stores key material by default
   - BUT: `config.keys` in localStorage is still read as a fallback by `KeyContext`, and the Settings config-import flow can still write TSIG key material (and legacy `dnsBackups`) into localStorage
   - **Impact**: Key material can still end up XSS-readable via the legacy path
   - **Fix**: Remove the `keys` field from frontend config, drop the fallback, and migrate the import flow to `/api/tsig-keys`

2. ~~**TSIG Keys Transmitted in HTTP Headers**~~ — **RESOLVED**: the frontend sends no key material (src/services/dnsService.ts `createHeaders()`); requests authenticate with the session cookie and the backend resolves the zone's TSIG key from its encrypted server-side store (backend/src/routes/zoneRoutes.ts). Vestigial `x-dns-*` entries remain in the CORS `allowedHeaders` list (backend/src/server.ts) and could be removed.

3. ~~**No Authentication/Authorization System**~~ — **RESOLVED**: session-based auth (`express-session`, file store, httpOnly cookies) with local bcrypt users and Microsoft Entra ID SSO; roles (admin/editor/viewer) enforced via `requireAuth`/`requireRole`/`requireKeyAccess`/`requireWriteAccess` (backend/src/middleware/auth.ts); per-user key and zone allowlists; persistent audit trail. Note: the legacy `/api/keys` stub route is still mounted without auth (it is a no-op).

4. ~~**Webhook URLs in localStorage**~~ — **RESOLVED**: webhook config is stored server-side (`data/webhook-configs.json`) behind the authenticated `/api/webhook-config` routes; `ConfigContext` strips webhook fields from localStorage.

### 🟠 High Priority Issues

5. **Duplicate Type Definitions** (src/types/ and backend/src/types/)
   - All TypeScript types are duplicated between frontend and backend
   - Changes must be manually synchronized
   - **Impact**: Type drift, maintenance burden, bugs from inconsistencies
   - **Fix**: Create shared types package or use monorepo with shared types

6. ~~**Duplicate Context Files**~~ — **RESOLVED**: Single `src/context/` directory, all files migrated to TypeScript.

7. ~~**Non-Atomic Update Operations**~~ — **RESOLVED**: `updateRecord()` uses a single nsupdate transaction with a `prereq yxrrset` guard (RFC 2136 §2.4.1), and bulk apply/restore goes through `dnsService.applyBatch()` — one all-or-nothing transaction per zone.

8. ~~**No Backend Validation**~~ — **RESOLVED**: route handlers validate every record server-side via `validationService.validateRecord` (add/delete/update/batch), plus Zod request schemas and the `dnsSafety` name/injection guards.

9. ~~**Incomplete IPv6 Validation**~~ — **RESOLVED**: `isValidIPv6` (frontend `dnsValidationService.ts` and backend `validationService.ts`) accepts compressed (`::`), IPv4-mapped, and general embedded-IPv4 forms and rejects malformed input; `formatAAAARecord` delegates to it. IPv4 leading zeros are rejected.

### 🟡 Medium Priority Issues

10. ~~**No Rate Limiting**~~ — **RESOLVED**: `express-rate-limit` middleware (backend/src/middleware/rateLimiter.ts) — a global API limiter plus dedicated DNS query/modify, key-management, webhook, and login limiters applied per route.

11. ~~**Hardcoded Temporary File Path**~~ — **RESOLVED**: `dnsService` uses `config.tempDir` (`TEMP_DIR`, default `/tmp/snap-dns`) and creates the directory recursively before use (backend/src/services/dnsService.ts:53-66).

12. **In-Memory Zone Deduplication** (backend/src/services/dnsService.ts:348)
    - Large zones loaded entirely into memory via Map
    - **Impact**: Memory exhaustion for very large zones
    - **Fix**: Stream processing or pagination

13. **CORS Allow-All in Development** (backend/src/server.ts:56-61)
    - Development and test modes accept requests from any origin
    - **Impact**: Development environments can be attacked
    - **Fix**: Use specific allowlist even in development

14. ~~**No Audit Logging**~~ — **RESOLVED**: `auditService` appends structured JSON entries to `data/audit.log`; queryable via the admin-only `/api/audit` routes and the `AuditLog` UI in Settings.

15. ~~**Mixed JavaScript/TypeScript**~~ — **RESOLVED**: All frontend files migrated to TypeScript. Only `setupProxy.js` remains as JS (CRA requirement).

16. **Sensitive Data in Logs**
    - Some places may log keyName and algorithm
    - Could aid in credential guessing
    - **Impact**: Information leakage
    - **Fix**: Audit all logging, redact all sensitive data

17. ~~**No Request Validation Middleware**~~ — **RESOLVED**: Zod schemas in `backend/src/middleware/validation.ts` (DNS records, login, change-password, TSIG key create/update) applied on the relevant routes, alongside `validationService` record validation.

18. ~~**Backups Stored in localStorage**~~ — **RESOLVED**: backups are stored server-side (`data/backups/`, capped per zone) via the authenticated `/api/backups` routes; the frontend `backupService` is a pure API client and the Snapshots UI handles create/compare/restore. Note: the legacy Settings import flow can still write an old-style `dnsBackups` blob to localStorage (see #1).

## Development Guidelines

### Code Style

- All code files must start with path/filename as a one-line comment
- Comments should describe purpose and effect when necessary
- Prioritize modularity, DRY principles, performance, and security
- Finish one file completely before moving to the next
- For incomplete work, add TODO comments
- Show concise step-by-step reasoning
- When writing code, act as a language specialist with proper planning

### TypeScript Configuration

**Frontend (tsconfig.json):**
- Strict mode enabled
- Module: ESNext with node resolution
- Base URL: `src` with path aliases
- JSX: react-jsx

**Backend (backend/tsconfig.json):**
- Target: ES2018, Module: CommonJS
- Outputs to `./dist`
- Strict mode enabled

### Security Considerations

1. **TSIG Key Handling**: Keys are stored server-side, encrypted at rest (`tsigKeyService`), and are never sent by the frontend; requests authenticate via the session cookie. Never log full key values (use '[REDACTED]').

2. **Input Validation**: All DNS records go through validation in both frontend and backend. Special attention to:
   - SQL injection-like patterns in TXT records
   - Invalid domain names
   - Malformed record data

3. **CORS**: Backend validates origins in production mode. Development and test modes allow all origins.

### Error Handling

Zone routes return structured error codes from an `ErrorCodes` map (backend/src/routes/zoneRoutes.ts): `DUPLICATE_RECORD`, `INVALID_RECORD`, `ZONE_NOT_FOUND`, `RECORD_NOT_FOUND`, `MISSING_CONFIG`, `PERMISSION_DENIED`, `SERVER_ERROR`, `VALIDATION_ERROR`, `NETWORK_ERROR`. The frontend wraps failures in a `DNSError` class (src/services/dnsService.ts). Validation errors include detailed field-level feedback.

### Testing DNS Operations

When testing DNS changes:
1. Always create a backup/snapshot first
2. Use the pending changes drawer to review before applying
3. Verify records are formatted correctly in the preview
4. Test with non-critical zones first
5. Check webhook notifications are working

## Common Patterns

### Adding a New Record Type

1. Add type to `RecordType` enum in both `src/types/dns.ts` and `backend/src/types/dns.ts`
2. Update formatting logic in `backend/src/services/dnsService.ts` `normalizeRecord()` method
3. Add validation rules in `src/services/dnsValidationService.ts`
4. Update UI components to handle the new type

### Modifying DNS Service Logic

When modifying DNS operations:
- Backend `dnsService` handles actual `nsupdate` and `dig` commands
- Frontend `dnsService` is the HTTP client wrapper
- Always maintain record normalization (lowercase, trailing dot removal)
- Be careful with SOA record handling - they're treated specially

### Working with Pending Changes

Pending changes are a flat queue in `PendingChangesContext` (no undo/redo); each change gets a unique id and can be removed individually. Changes are only sent to the backend when "Apply Changes" is confirmed in the drawer's confirmation dialog — grouped by zone and applied via `dnsService.applyBatch()`, one atomic nsupdate transaction per zone.
