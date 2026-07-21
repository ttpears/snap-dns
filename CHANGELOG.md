# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
