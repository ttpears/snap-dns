# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.0] - 2026-07-21

### Added

- **KeySelector disambiguates zones served by multiple keys.** When no key is
  selected, a zone name served by more than one key (e.g. a split-horizon
  internal vs external view) now expands into one dropdown entry per key
  (`zone — keyName (server)`); selecting one sets the key and zone together.
  Single-key zones are unchanged, and once a key is selected the list is already
  that key's zones. `KeyContext` gained `selectKeyAndZone` to set both atomically.

### Fixed

- **Webhook "Test" and change notifications no longer fail silently / with
  "Authentication required".** Notification failures after applying changes are
  now surfaced as a non-blocking UI warning (the DNS change still succeeds)
  instead of only a console warning.
- **JSON-backed persistence is now crash-safe and race-safe.** `tsigKeyService`,
  `apiTokenService`, `userService`, `backupService`, `webhookConfigService`, and
  `ssoConfigService` write via a shared atomic helper (temp file + `fsync` +
  rename) with per-file serialization, so a crash mid-write can't corrupt a store
  and concurrent writers can't clobber each other.

### Documentation

- Refreshed `CLAUDE.md` to reflect features shipped in 3.2.0–3.3.2 (personal API
  tokens, the split-view `keyId` requirement, the key-management rate-limiter
  split, the webhook auth proxy, the snapshot size budget) and corrected the
  now-resolved legacy-localStorage security note.

## [3.3.2] - 2026-07-21

### Fixed

- **Webhook "Test" and change notifications no longer fail with "Authentication
  required".** The frontend posts webhook notifications through the authenticated
  backend proxy (`POST /api/webhook/notify`, behind `requireAuth`), but the
  `fetch` in `notificationService.sendWebhook` omitted `credentials: 'include'`,
  so the session cookie was never sent and the request returned 401
  `NOT_AUTHENTICATED`. This affected both the "Test Webhook" button and real
  post-change notifications (the latter failed silently). Sending the cookie
  fixes both. The webhook delivery itself was never broken — only snap-dns's
  authenticated proxy was rejecting the request.

## [3.3.1] - 2026-07-21

### Fixed

- **A burst of key edits no longer makes TSIG keys look wiped.** The strict
  key-management rate limiter was applied to the whole `/api/tsig-keys` router,
  so rapid edits also throttled `GET /api/tsig-keys`; the failed list fetch then
  rendered as "No TSIG keys configured" — indistinguishable from the keys being
  deleted. The limiter now applies only to mutating routes (create/update/delete);
  reads use the general limiter, and the per-window mutation cap was raised from
  10 to 30 for legitimate multi-key setup. Keys were never actually lost.
- **The Keys panel now distinguishes a failed load from an empty list.** When the
  list fetch errors (e.g. a 429), the table shows a "Couldn't load — they have not
  been changed" state and a reassuring message instead of the empty "No TSIG keys
  configured" state.

### Changed

- Rate limiters in `rateLimiter.ts` now evaluate the `RATE_LIMIT_ENABLED` toggle
  per request (matching `loginLimiter`) instead of caching it at module load, so
  the setting takes effect without a restart.

## [3.3.0] - 2026-07-21

### Added

- **Personal API tokens for programmatic access.** Users can mint bearer tokens
  (`sdns_<40 hex>`) from the new "API Tokens" tab in Settings to drive DNS
  operations from scripts/CI. Only a SHA-256 hash is stored server-side
  (`data/api-tokens.json`); the raw token is shown exactly once and never logged.
  A token authenticates as its owner with the owner's **live** privileges
  (role/zone/key allowlists re-read per request, so revocations apply
  immediately). Sessions remain the primary auth path and always take precedence.
  Token create/list/revoke are session-only (a token can never manage tokens),
  require the current password, are rate-limited per principal, and audited.
  Tokens can be given an optional expiry (capped at 365 days).

  Note: because zone operations require an explicit `keyId` (see 3.2.0),
  programmatic callers must include the `keyId` (query param on `GET`, body field
  on writes) just as the UI does.

### Fixed

- **Snapshot storage is now bounded.** Server-side snapshots could grow without
  limit and fill the disk. A global size budget (`BACKUP_MAX_TOTAL_SIZE_MB`,
  default 512 MB) now evicts the globally-oldest snapshots once a new one would
  exceed it, and a snapshot larger than the whole budget is rejected. Snapshot
  creation is also gated by the same deny-by-default zone-access check as the
  zone routes, closing a path where an editor could spawn unbounded per-zone
  files for zones they cannot access.

## [3.2.0] - 2026-07-21

### Fixed

- **Split-horizon views are no longer conflated.** When the same zone name
  existed under two TSIG keys (e.g. an internal and an external view), a record
  edit was routed to whichever key the backend happened to resolve first by zone
  name, so an internal-view change could land on the external server (and vice
  versa). Every zone operation now carries the explicitly selected key, and the
  backend targets that exact key/view.

### Changed

- **Zone API operations now require an explicit `keyId`.** `GET /api/zones/:zone`
  takes a `keyId` query parameter; the record add/delete/update and batch
  endpoints take a `keyId` in the request body. The backend authorizes the key
  (it must be in the caller's allowlist and configured for the zone) and resolves
  the DNS server from it, instead of guessing a key from the zone name. Requests
  without a `keyId` are rejected. The frontend sends the selected key
  automatically; any programmatic API client must be updated to include it.
- **Pending changes apply per (zone, key).** The apply flow groups queued changes
  by both zone and key, so a batch is sent through the exact view each change was
  queued under — changes across different keys are never collapsed into one
  transaction. The confirmation dialog now names the key/view for each group.
- **Snapshots record the key/view they were taken through** (`keyId`), and
  compare/restore read and write that same view. Older snapshots without a
  recorded key fall back to a key on the same server (then any key serving the
  zone).

## [3.1.0] - 2026-07-13

### Added

- **Reverse-zone sub-selection in the TSIG Key Selection panel.** When the zone
  list contains more than 5 reverse zones (`.in-addr.arpa` / `.ip6.arpa`), they
  are collapsed behind a single "Reverse zones (N)…" entry in the main zone
  dropdown; choosing it reveals a dedicated reverse-zone dropdown. This keeps
  forward zones easy to find when many reverse zones are present. At 5 or fewer
  reverse zones the list is unchanged (all zones inline). The three key/zone
  selects also gained proper label associations for accessibility.

## [3.0.0] - 2026-07-13

### ⚠️ Breaking Changes

- **Per-user zone access is now deny-by-default.** An empty `allowedZones` list
  previously granted a non-admin user access to **all** zones; it now grants
  access to **no** zones, matching the existing deny-by-default semantics of
  `allowedKeyIds`. Admins are unaffected (they bypass the zone gate).

  **Upgrade action required:** before or immediately after upgrading, review every
  non-admin (editor/viewer) user. Any such user who relied on an empty
  `allowedZones` to reach zones must have their zones assigned explicitly in
  Settings → Users, or they will be denied access to all zones. New SSO users are
  created with an empty `allowedZones`, so they also require explicit zone grants.

  A key's own `zones: []` still means "this key is valid for all zones" — that is
  an admin-configured key capability, not a per-user access grant, and is
  unchanged.

### Security

- **Fixed a TSIG key metadata leak in the key listing.** `GET /api/tsig-keys`
  filtered the returned keys only when the caller's allowlist was non-empty, so a
  non-admin editor/viewer with an empty `allowedKeyIds` received every key's
  metadata (name, server, key name, algorithm, zones). Secrets were never exposed.
  The list path now applies a provided allowlist even when empty (empty → sees
  nothing), consistent with the key-use path (`getKeyForZone`).

[3.1.0]: https://github.com/ttpears/snap-dns/releases/tag/v3.1.0
[3.0.0]: https://github.com/ttpears/snap-dns/releases/tag/v3.0.0
