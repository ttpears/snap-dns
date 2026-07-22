// backend/src/services/apiTokenService.ts
// Personal API token storage and verification.
//
// Tokens are Cloudflare-style long-lived bearer credentials ("sdns_<40 hex>").
// Only the sha256 hash of the raw token is persisted; the raw value is returned
// exactly once at creation and is never written to disk or logged. A byHash map
// gives O(1) verify lookups, and verification is constant-time to avoid leaking
// hash bytes through timing. A token inherits its owning user's live privileges
// at auth time (loaded elsewhere via userService), so no role/zone data is
// stored here.

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeJsonAtomic } from '../utils/atomicJson';

const TOKENS_FILE = path.join(process.cwd(), 'data', 'api-tokens.json');

export interface ApiToken {
  id: string;              // `token_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  name: string;
  userId: string;          // owning user id
  tokenHash: string;       // sha256 hex of the raw token (full "sdns_..." string)
  tokenPrefix: string;     // raw.slice(0, 12), display only (e.g. "sdns_1a2b3c4")
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiTokenResponse {   // metadata only — NEVER tokenHash / userId
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface ApiTokenCreateResult {
  raw: string;
  record: ApiToken;
}

export interface ApiTokenServiceConfig {
  filePath: string;
}

export type VerifyResult =
  | { status: 'valid'; token: ApiToken }
  | { status: 'not_found' | 'expired' | 'revoked' };

const sha256hex = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

export class ApiTokenService {
  private tokens: Map<string, ApiToken> = new Map();
  private byHash: Map<string, ApiToken> = new Map();
  private initialized = false;
  private readonly filePath: string;

  constructor(cfg: ApiTokenServiceConfig = { filePath: TOKENS_FILE }) {
    this.filePath = cfg.filePath;
  }

  /**
   * Load tokens from disk (empty on first run). Rebuilds both the id-keyed and
   * hash-keyed maps and revives Date fields.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });

      try {
        const data = await fs.readFile(this.filePath, 'utf-8');
        const arr: ApiToken[] = JSON.parse(data);

        arr.forEach(t => {
          t.createdAt = new Date(t.createdAt);
          t.lastUsedAt = t.lastUsedAt ? new Date(t.lastUsedAt) : null;
          t.expiresAt = t.expiresAt ? new Date(t.expiresAt) : null;
          t.revokedAt = t.revokedAt ? new Date(t.revokedAt) : null;
          this.tokens.set(t.id, t);
          this.byHash.set(t.tokenHash, t);
        });

        console.log(`Loaded ${this.tokens.size} API tokens from disk`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('No existing API tokens file');
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize API token service:', error);
      throw error;
    }
  }

  /**
   * Persist the full token set to disk. Only hashes/metadata are written; the
   * raw token never exists on disk.
   */
  private async save(): Promise<void> {
    const arr = Array.from(this.tokens.values());
    // Atomic + per-path serialized write. This matters most for the throttled,
    // fire-and-forget lastUsedAt touch in verifyToken(), which can otherwise
    // race a create/revoke and lose an update.
    await writeJsonAtomic(this.filePath, arr);
  }

  /**
   * Create a token for a user. Returns the raw token exactly once — callers must
   * surface it immediately and never store it. Only the hash is persisted.
   */
  async createToken(userId: string, name: string, expiresInDays?: number): Promise<ApiTokenCreateResult> {
    if (!this.initialized) await this.initialize();

    const raw = 'sdns_' + crypto.randomBytes(20).toString('hex');
    const tokenHash = sha256hex(raw);
    const tokenPrefix = raw.slice(0, 12);
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;

    const record: ApiToken = {
      id: `token_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      name,
      userId,
      tokenHash,
      tokenPrefix,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
    };

    this.tokens.set(record.id, record);
    this.byHash.set(record.tokenHash, record);
    await this.save();

    // Never log the raw token or hash — id/name/prefix only.
    console.log('API token created:', record.id, name, 'for user', userId);
    return { raw, record };
  }

  /**
   * Verify a raw bearer token. Constant-time hash comparison, then revocation
   * and expiry checks. On success, best-effort touches lastUsedAt at most once
   * per minute (fire-and-forget save; never blocks the request).
   */
  async verifyToken(raw: string): Promise<VerifyResult> {
    if (!this.initialized) await this.initialize();

    const hash = sha256hex(raw);
    const candidate = this.byHash.get(hash);
    if (!candidate) return { status: 'not_found' };

    // Constant-time confirm to avoid leaking the stored hash through timing.
    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate.tokenHash, 'hex'))) {
      return { status: 'not_found' };
    }

    if (candidate.revokedAt) return { status: 'revoked' };
    if (candidate.expiresAt && candidate.expiresAt.getTime() < Date.now()) {
      return { status: 'expired' };
    }

    // Throttled lastUsedAt touch: at most once per minute, best-effort.
    if (!candidate.lastUsedAt || Date.now() - candidate.lastUsedAt.getTime() > 60_000) {
      candidate.lastUsedAt = new Date();
      this.save().catch(() => { /* best-effort touch; never block auth on a write error */ });
    }

    return { status: 'valid', token: candidate };
  }

  /**
   * List a user's own, non-revoked tokens as metadata only.
   */
  async listTokensForUser(userId: string): Promise<ApiTokenResponse[]> {
    if (!this.initialized) await this.initialize();

    return Array.from(this.tokens.values())
      .filter(t => t.userId === userId && !t.revokedAt)
      .map(t => this.toResponse(t));
  }

  /**
   * Revoke a token the caller owns. Returns false for unknown ids, other users'
   * tokens, or already-revoked tokens.
   */
  async revokeToken(userId: string, id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    const t = this.tokens.get(id);
    if (!t || t.userId !== userId || t.revokedAt) return false;

    t.revokedAt = new Date();
    await this.save();
    return true;
  }

  /**
   * Convert an ApiToken to its metadata-only response (no hash, no userId).
   */
  private toResponse(t: ApiToken): ApiTokenResponse {
    return {
      id: t.id,
      name: t.name,
      prefix: t.tokenPrefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
    };
  }
}

export const apiTokenService = new ApiTokenService();
