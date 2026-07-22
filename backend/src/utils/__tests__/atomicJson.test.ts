// backend/src/utils/__tests__/atomicJson.test.ts
// Verifies the two guarantees of the shared JSON persistence helper:
//  1. Crash safety: a write failure never leaves the target truncated/corrupt —
//     the temp file is renamed into place, so the target is only ever complete
//     JSON (or its previous complete contents).
//  2. Serialization: many concurrent writes to the same path apply one at a time
//     in call order, so the last write wins and no update is lost or interleaved.

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { writeJsonAtomic, writeFileAtomic, removeFileLocked, withFileLock } from '../atomicJson';

describe('atomicJson', () => {
  let dir: string;
  let target: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-atomic-'));
    target = path.join(dir, 'data.json');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes via a temp file and renames over the target', async () => {
    const renameSpy = jest.spyOn(fs, 'rename');

    await writeJsonAtomic(target, { hello: 'world' });

    // The final write must be a rename onto the target, not an in-place write.
    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [from, to] = renameSpy.mock.calls[0];
    expect(to).toBe(target);
    expect(from).not.toBe(target);

    const parsed = JSON.parse(await fs.readFile(target, 'utf-8'));
    expect(parsed).toEqual({ hello: 'world' });
  });

  it('leaves an existing target intact and drops the temp file when the write fails', async () => {
    // Seed a valid target so we can prove it survives a failed overwrite.
    await writeJsonAtomic(target, { good: true });

    // Simulate a crash mid-rename (data already streamed to temp, rename fails).
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('simulated crash'));

    await expect(writeJsonAtomic(target, { good: false })).rejects.toThrow('simulated crash');

    // Target still parses and still holds the previous complete contents —
    // never a truncated/partial file.
    const parsed = JSON.parse(await fs.readFile(target, 'utf-8'));
    expect(parsed).toEqual({ good: true });

    // No stray temp files left behind in the directory.
    const leftovers = (await fs.readdir(dir)).filter(n => n.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('creates a fresh target atomically even when none exists', async () => {
    await writeFileAtomic(target, 'plain-contents');
    expect(await fs.readFile(target, 'utf-8')).toBe('plain-contents');
  });

  it('serializes many concurrent writes to the same path with no lost update', async () => {
    // Fire 50 overlapping writes at the same file. Without serialization their
    // temp-file writes and renames would interleave; with it, the last enqueued
    // write wins and the file is always complete JSON.
    const count = 50;
    const writes = Array.from({ length: count }, (_, i) => writeJsonAtomic(target, { seq: i }));
    await Promise.all(writes);

    const parsed = JSON.parse(await fs.readFile(target, 'utf-8'));
    // The final enqueued write (highest seq) is the durable one.
    expect(parsed).toEqual({ seq: count - 1 });
  });

  it('runs same-path tasks in enqueue order and never overlaps them', async () => {
    const events: string[] = [];
    const gated = (id: number, delayMs: number) =>
      withFileLock(target, async () => {
        events.push(`start-${id}`);
        await new Promise(r => setTimeout(r, delayMs));
        events.push(`end-${id}`);
      });

    // First task is slowest; if tasks overlapped, its end would come after a
    // later task's start. Serialization forces strict start/end pairing in order.
    await Promise.all([gated(0, 30), gated(1, 5), gated(2, 5)]);

    expect(events).toEqual([
      'start-0', 'end-0',
      'start-1', 'end-1',
      'start-2', 'end-2',
    ]);
  });

  it('does not wedge the queue when one task rejects', async () => {
    const results: string[] = [];
    const ok1 = withFileLock(target, async () => { results.push('a'); });
    const boom = withFileLock(target, async () => { throw new Error('boom'); });
    const ok2 = withFileLock(target, async () => { results.push('c'); });

    await ok1;
    await expect(boom).rejects.toThrow('boom');
    await ok2; // later caller still runs despite the middle rejection

    expect(results).toEqual(['a', 'c']);
  });

  it('removes a file under the same lock, serialized against writes', async () => {
    await writeJsonAtomic(target, { x: 1 });
    // Enqueue a write then a remove; the remove must win as the last operation.
    const w = writeJsonAtomic(target, { x: 2 });
    const r = removeFileLocked(target);
    await Promise.all([w, r]);

    await expect(fs.readFile(target, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
