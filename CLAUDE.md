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

## Architecture

### Frontend Structure

The frontend is a React application with Material-UI components and follows a context-based state management pattern:

**Context Providers (Nested in App.jsx):**
- `ConfigProvider` - Manages DNS keys, webhooks, and application settings (localStorage-backed)
- `KeyProvider` - TSIG key management and zone assignments
- `ZoneProvider` - Current zone selection and zone operations
- `PendingChangesProvider` - Tracks DNS record changes with undo/redo support
- `ThemeProvider` - Dark/light mode theming

**Key Services (src/services/):**
- `dnsService.ts` - Frontend HTTP client for DNS operations (calls backend API)
- `backupService.ts` - Snapshot creation, comparison, and restore operations
- `notificationService.ts` - Multi-provider webhook notifications (Slack, Discord, Teams, Mattermost)
- `dnsValidationService.ts` - Client-side record validation
- `dnsRecordFormatter.ts` - Record formatting and parsing utilities

**Main Components:**
- `AppContent` - Main layout with drawer navigation
- `Settings` - Configuration management UI (keys, webhooks, settings)
- Zone management components (located throughout the codebase)

### Backend Structure

The backend is an Express TypeScript application that executes DNS operations:

**Entry Point:** `backend/src/server.ts`
- CORS configuration with environment-specific allowed origins
- Middleware: logging, JSON parsing (10mb limit), DNS message parsing
- Routes mounted at `/api/zones`, `/api/keys`, `/api/webhook`

**Services (backend/src/services/):**
- `dnsService.ts` - Executes `nsupdate` and `dig` commands via child_process
  - `fetchZoneRecords()` - Uses `dig AXFR` to fetch zone records
  - `addRecord()`/`deleteRecord()` - Creates temporary nsupdate files and executes them
  - Record normalization and deduplication logic
- `keyService.ts` - TSIG key management
- `webhookService.ts` - Webhook notification dispatch
- `notificationService.ts` - Multi-provider webhook formatting

**Routes:**
- `zoneRoutes.ts` - GET `/api/zones/:zone`, POST/DELETE `/api/zones/:zone/records`
- `keyRoutes.ts` - Key management endpoints
- `webhookRoutes.ts` - Webhook testing and configuration

### Type System

The project uses shared TypeScript types between frontend and backend:

**Core Types (duplicated in both `src/types/` and `backend/src/types/`):**
- `dns.ts` - DNSRecord, PendingChange, ZoneConfig, RecordType enum
- `config.ts` - Application configuration interfaces
- `keys.ts` - TSIG key configuration
- `webhook.ts` - Webhook provider types

**Important:** When modifying types, ensure changes are synchronized between frontend and backend type definitions.

### DNS Operations Flow

1. User selects zone and modifies records in the UI
2. Changes are tracked in `PendingChangesContext` (with undo/redo)
3. When applied, frontend `dnsService` sends HTTP requests with TSIG credentials in headers
4. Backend `dnsService` creates temporary nsupdate command files
5. Backend executes `nsupdate` with TSIG authentication
6. Webhooks are triggered for change notifications
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
- TSIG keys with zone assignments
- Webhook URLs and provider types
- Default TTL and display settings

**Backend Configuration (Environment Variables):**
- `BACKEND_PORT` - Server port (default: 3002)
- `BACKEND_HOST` - Server host (default: 0.0.0.0)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins
- `NODE_ENV` - Environment mode (development allows all CORS)
- `MAX_REQUEST_SIZE` - Request size limit (default: 10mb)
- `TEMP_DIR` - Temporary file directory (default: /tmp/snap-dns)

**Frontend Environment Variables:**
- `REACT_APP_API_URL` - Backend API URL
- `PUBLIC_URL` - Frontend public URL
- `WDS_SOCKET_PORT` - Webpack dev server socket port

## ⚠️ Problematic Design Decisions

**WARNING**: This application has significant security and architectural issues that make it unsuitable for production use without major refactoring.

The following design issues should be addressed before production use:

### Summary of Critical Issues
- **Security**: TSIG credentials stored in browser localStorage and transmitted in HTTP headers
- **Authentication**: No user authentication or authorization system
- **Data Integrity**: Non-atomic DNS updates risk data loss
- **Validation**: Backend trusts frontend validation completely
- **Code Organization**: Duplicate type definitions and context files

### 🔴 Critical Security Issues

1. **TSIG Keys Stored in localStorage** (src/context/ConfigContext.tsx:24, ConfigContext.js:33,43)
   - TSIG keys are stored in browser localStorage, which is accessible via JavaScript
   - localStorage is not encrypted and survives XSS attacks
   - **Impact**: Anyone with XSS access can steal DNS credentials
   - **Fix**: Use server-side session storage with HTTP-only cookies, or encrypted storage

2. **TSIG Keys Transmitted in HTTP Headers** (src/services/dnsService.ts:58-69, backend/src/routes/zoneRoutes.ts:44-48)
   - Full TSIG keys (keyValue) sent in plaintext HTTP headers on every request
   - Keys logged in multiple places (backend/src/helpers/fileHelpers.js)
   - **Impact**: Keys can be intercepted via network sniffing, proxy logs, or server logs
   - **Fix**: Use session-based authentication, encrypt keys at rest, never log key values

3. **No Authentication/Authorization System**
   - Backend has no user authentication (backend/src/server.ts)
   - Anyone who can reach the backend API can perform DNS operations
   - No audit trail of who made which changes
   - **Impact**: No access control, no accountability
   - **Fix**: Implement proper authentication (OAuth, SAML, etc.) and RBAC

4. **Webhook URLs in localStorage** (multiple locations)
   - Internal webhook URLs stored in browser
   - Could expose internal infrastructure topology
   - **Impact**: Information disclosure
   - **Fix**: Store webhook configs server-side

### 🟠 High Priority Issues

5. **Duplicate Type Definitions** (src/types/ and backend/src/types/)
   - All TypeScript types are duplicated between frontend and backend
   - Changes must be manually synchronized
   - **Impact**: Type drift, maintenance burden, bugs from inconsistencies
   - **Fix**: Create shared types package or use monorepo with shared types

6. **Duplicate Context Files** (src/context/ and src/contexts/)
   - Both directories exist with duplicate files (PendingChangesContext.jsx in both)
   - ConfigContext exists as both .js and .tsx
   - **Impact**: Confusion about which is canonical, potential runtime errors
   - **Fix**: Consolidate to single context/ directory, migrate all to TypeScript

7. **Non-Atomic Update Operations** (src/services/dnsService.ts:272-287)
   - `updateRecord()` performs DELETE then ADD
   - If ADD fails after DELETE succeeds, record is lost
   - **Impact**: Data loss risk during updates
   - **Fix**: Use BIND's atomic update operations or implement rollback

8. **No Backend Validation** (backend/src/routes/zoneRoutes.ts)
   - Backend trusts frontend validation completely
   - No validation layer in route handlers
   - **Impact**: Malicious clients can bypass validation
   - **Fix**: Implement server-side validation using existing validation service

9. **Incomplete IPv6 Validation** (src/services/dnsValidationService.ts:121)
   - Regex doesn't handle compressed IPv6 notation (::)
   - Doesn't validate IPv6 with embedded IPv4 (::ffff:192.0.2.1)
   - **Impact**: Valid IPv6 addresses rejected, invalid ones accepted
   - **Fix**: Use proper IPv6 parsing library

### 🟡 Medium Priority Issues

10. **No Rate Limiting**
    - No rate limiting on DNS operations
    - **Impact**: Abuse potential, DoS attacks
    - **Fix**: Add express-rate-limit middleware

11. **Hardcoded Temporary File Path** (backend/src/services/dnsService.ts:12)
    - `/tmp/snap-dns` is hardcoded
    - No check if directory exists
    - **Impact**: Fails in environments without /tmp, potential permission issues
    - **Fix**: Use config.tempDir consistently, ensure directory exists

12. **In-Memory Zone Deduplication** (backend/src/services/dnsService.ts:113)
    - Large zones loaded entirely into memory via Map
    - **Impact**: Memory exhaustion for very large zones
    - **Fix**: Stream processing or pagination

13. **CORS Allow-All in Development** (backend/src/server.ts:38-40)
    - Development mode accepts requests from any origin
    - **Impact**: Development environments can be attacked
    - **Fix**: Use specific allowlist even in development

14. **No Audit Logging**
    - No persistent record of who changed what DNS records
    - Console.log only (ephemeral)
    - **Impact**: No forensics capability, compliance issues
    - **Fix**: Implement structured logging to persistent storage

15. **Mixed JavaScript/TypeScript** (src/context/ directory)
    - ConfigContext.js and ConfigContext.tsx both exist
    - Some contexts are .jsx, some .tsx
    - **Impact**: Type safety inconsistencies, confusion
    - **Fix**: Migrate all to TypeScript

16. **Sensitive Data in Logs** (backend/src/helpers/fileHelpers.js)
    - While some places redact keys, helpers log keyName and algorithm
    - Could aid in credential guessing
    - **Impact**: Information leakage
    - **Fix**: Audit all logging, redact all sensitive data

17. **No Request Validation Middleware**
    - No request schema validation (e.g., Joi, Zod)
    - Manual validation in each route
    - **Impact**: Inconsistent validation, maintenance burden
    - **Fix**: Add request validation middleware

18. **Backups Stored in localStorage** (src/services/backupService.ts)
    - DNS zone backups stored in browser localStorage
    - 5-10MB localStorage limit can be exceeded
    - Lost on cache clear
    - **Impact**: Unreliable backup system
    - **Fix**: Store backups server-side or allow export to files

## Development Guidelines

### Code Style (.cursorrules)

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

1. **TSIG Key Handling**: Keys are stored in localStorage (frontend) and passed via headers to backend. Never log full key values (use '[REDACTED]').

2. **Input Validation**: All DNS records go through validation in both frontend and backend. Special attention to:
   - SQL injection-like patterns in TXT records
   - Invalid domain names
   - Malformed record data

3. **CORS**: Backend validates origins in production mode. Development mode allows all origins.

### Error Handling

The backend uses a custom `DNSError` class with error codes:
- `DUPLICATE_RECORD` - Record already exists
- `SERVER_ERROR` - Communication failure
- Validation errors include detailed field-level feedback

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

The pending changes system uses a stack-based undo/redo mechanism. Changes are only sent to the backend when "Apply Changes" is clicked. The context maintains change history and supports bulk operations.
