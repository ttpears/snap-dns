# Shared Types

This package contains shared TypeScript type definitions used by both the Snap DNS frontend and backend.

## Purpose

Previously, type definitions were duplicated in `src/types/` (frontend) and `backend/src/types/` (backend), leading to:
- Type drift between frontend and backend
- Manual synchronization burden
- Potential bugs from inconsistencies

This shared types package solves these issues by providing a single source of truth for shared type definitions.

## Structure

- `dns.ts` - DNS record types, operations, and validation
- `keys.ts` - TSIG key types and operations
- `webhook.ts` - Webhook configuration and payload types
- `index.ts` - Main export file

## Usage

### Frontend

```typescript
import { DNSRecord, RecordType, Key, WebhookProvider } from '../../../shared-types';
```

### Backend

```typescript
import { DNSRecord, ZoneConfig, WebhookPayload } from '../../shared-types';
```

## Note on Domain-Specific Types

Some types remain in their respective domains because they serve different purposes:

- **Frontend `src/types/config.ts`**: Application configuration (UI settings, user preferences)
- **Backend `backend/src/types/config.ts`**: Server configuration (host, port, CORS, rate limits)
- **Backend `backend/src/types/auth.ts`**: Backend-specific authentication types

These domain-specific types should NOT be moved to shared-types.

## Development

When adding new shared types:

1. Determine if the type is truly shared across frontend/backend
2. Add the type to the appropriate file in `shared-types/`
3. Export it in `index.ts` if needed
4. Update imports in frontend and backend code
5. Remove old duplicate definitions

## Migration Status

✅ DNS types consolidated
✅ Key types consolidated
✅ Webhook types consolidated
⏸️ Config types remain separate (domain-specific)
⏸️ Auth types remain in backend (backend-only)
