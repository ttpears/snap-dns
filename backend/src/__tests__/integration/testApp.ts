// backend/src/__tests__/integration/testApp.ts
// Shared helpers for HTTP-level route integration tests.
//
// These tests exercise the REAL Express middleware chain (session, auth guards,
// RBAC, forced-password-change, rate-limit skip logic) via supertest — the layer
// that was previously only verified by introspecting the router stack. The app
// is built with an in-memory session store so nothing touches the on-disk file
// store, and jest.setup.js has already chdir'd the process into a throwaway data
// directory so the JSON-backed services persist to a clean temp location.

import session from 'express-session';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server';
import { userService } from '../../services/userService';
import { UserRole } from '../../types/auth';

// These suites do real bcrypt work (cost factor 12) and multiple sequential
// HTTP round-trips. Under the full parallel test run bcrypt contends for CPU, so
// the default 5s hook/test timeout is too tight. Raise it for every file that
// imports this helper.
jest.setTimeout(30000);

/**
 * Build a fresh app instance backed by an in-memory session store. Each call
 * gets its own store so cookies from one test never leak into another.
 */
export function buildTestApp(): Express {
  return createApp({ sessionStore: new session.MemoryStore() });
}

export interface SeedUserOptions {
  username: string;
  password: string;
  role: UserRole;
  /** Defaults to false so seeded accounts can mutate immediately. */
  mustChangePassword?: boolean;
  allowedZones?: string[];
  allowedKeyIds?: string[];
}

/**
 * Create (or reset) a user directly through the service so tests start from a
 * known account. `userService.createUser` always sets mustChangePassword=true,
 * so we re-set the password afterwards to control the flag deterministically.
 * Returns the user id.
 */
export async function seedUser(opts: SeedUserOptions): Promise<string> {
  await userService.initialize();

  let existing = await userService.getUserByUsername(opts.username);
  if (!existing) {
    const created = await userService.createUser({
      username: opts.username,
      password: opts.password,
      role: opts.role,
      allowedKeyIds: opts.allowedKeyIds ?? [],
      allowedZones: opts.allowedZones ?? [],
    });
    existing = await userService.getUserById(created.id);
  }

  const id = existing!.id;
  await userService.updateUserRole(id, opts.role);
  await userService.updateAllowedZones(id, opts.allowedZones ?? []);
  await userService.updateAllowedKeys(id, opts.allowedKeyIds ?? []);
  // Set the password last so mustChangePassword lands in the desired state.
  await userService.updatePassword(id, opts.password, opts.mustChangePassword ?? false);
  return id;
}

/**
 * Log in and return a supertest agent that carries the session cookie for
 * subsequent authenticated requests, along with the raw login response.
 */
export async function loginAgent(
  app: Express,
  username: string,
  password: string
): Promise<{ agent: ReturnType<typeof request.agent>; res: request.Response }> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ username, password });
  return { agent, res };
}
