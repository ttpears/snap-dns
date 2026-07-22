// backend/src/utils/atomicJson.ts
// Crash-safe, race-free JSON persistence shared by the JSON-backed services.
//
// Two hazards this addresses:
//  1. Torn writes. A plain fs.writeFile truncates the target and streams bytes
//     in place, so a crash mid-write leaves a truncated/corrupt file that fails
//     to parse on the next start. We instead write a sibling temp file and
//     fs.rename() it over the target: rename is atomic on the same filesystem,
//     so a reader ever only observes the old complete file or the new complete
//     file, never a partial one.
//  2. Lost updates. The services do read-modify-write against in-memory state
//     and then persist. Two overlapping writers (e.g. a fire-and-forget
//     "lastUsedAt" touch racing a create) can interleave their rename calls and
//     clobber each other. We serialize all writes to a given path through a
//     per-path promise chain so they apply one at a time in call order.

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// One in-flight promise chain per absolute file path. Each new operation is
// appended to the tail so callers targeting the same file run sequentially;
// operations on different files stay fully concurrent.
const locks = new Map<string, Promise<void>>();

/**
 * Run `task` with exclusive access to `filePath` relative to every other caller
 * that goes through this helper. Tasks for the same resolved path execute in the
 * order they were enqueued; a task that rejects does not break the chain for
 * later callers. The map entry is dropped once the chain drains so it cannot
 * grow without bound.
 */
export function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prior = locks.get(key) ?? Promise.resolve();

  // Chain after any in-flight work regardless of whether it settled ok or not.
  const result = prior.then(task, task);

  // The stored tail must always resolve so one caller's failure never wedges the
  // queue for the next caller.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);

  // Best-effort cleanup: only clear the entry if nothing newer replaced it.
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });

  return result;
}

/**
 * Resolve once all currently-enqueued work for `filePath` has drained. Useful
 * for graceful shutdown and for tests that trigger fire-and-forget writes (e.g.
 * apiTokenService's throttled lastUsedAt touch) and must wait for them to hit
 * disk before tearing the directory down.
 */
export function flushFileLock(filePath: string): Promise<void> {
  const key = path.resolve(filePath);
  const prior = locks.get(key);
  return prior ? prior.then(() => undefined, () => undefined) : Promise.resolve();
}

/**
 * Atomically replace `filePath` with `contents`: write to a uniquely-named temp
 * file in the same directory, fsync it so the bytes are durable, then rename
 * over the target. The temp file is cleaned up on failure. Callers should
 * normally use writeJsonAtomic; this is exposed for non-JSON payloads.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );

  try {
    // Open, write and fsync via a handle so the temp file is fully on disk
    // before it becomes visible under the target name.
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(contents, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    await fs.rename(tmp, filePath);
  } catch (error) {
    // Never leave a stray temp file behind on a failed write.
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Serialize `value` as pretty-printed JSON (matching the services' existing
 * on-disk shape) and write it atomically, serialized against other writers of
 * the same path.
 */
export function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const contents = JSON.stringify(value, null, 2);
  return withFileLock(filePath, () => writeFileAtomic(filePath, contents));
}

/**
 * Remove `filePath` (no error if absent), serialized against writers of the same
 * path so a delete and a concurrent write cannot interleave. Used by
 * backupService when eviction empties a zone file.
 */
export function removeFileLocked(filePath: string): Promise<void> {
  return withFileLock(filePath, () => fs.rm(filePath, { force: true }));
}
