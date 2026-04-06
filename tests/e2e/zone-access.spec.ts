// tests/e2e/zone-access.spec.ts
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { USERS, ZONES } from './fixtures/test-data';

const API_URL = process.env.API_URL || 'http://localhost:3002';

async function loginAs(username: string, password: string) {
  const ctx = await playwrightRequest.newContext({
    baseURL: API_URL,
    storageState: { cookies: [], origins: [] },
  });
  const res = await ctx.post('/api/auth/login', {
    data: { username, password },
  });
  expect(res.ok()).toBeTruthy();
  return ctx;
}

async function getUserId(adminCtx: Awaited<ReturnType<typeof loginAs>>, username: string): Promise<string> {
  const res = await adminCtx.get('/api/auth/users');
  if (!res.ok()) {
    throw new Error(`Failed to list users: ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.users) {
    throw new Error(`No users in response: ${JSON.stringify(data)}`);
  }
  const user = data.users.find((u: any) => u.username === username);
  if (!user) throw new Error(`User '${username}' not found in user list`);
  return user.id;
}

// Reset editor zones to clean state after each test
async function resetEditorZones() {
  const ctx = await loginAs(USERS.admin.username, USERS.admin.password);
  const editorId = await getUserId(ctx, USERS.editor.username);
  await ctx.patch(`/api/auth/users/${editorId}/zones`, { data: { zones: [] } });
  await ctx.dispose();
}

test.describe('Zone Access Control', () => {
  test.afterEach(async () => {
    await resetEditorZones();
  });

  test('admin can restrict editor to specific zones', async () => {
    const adminCtx = await loginAs(USERS.admin.username, USERS.admin.password);
    const editorCtx = await loginAs(USERS.editor.username, USERS.editor.password);
    const editorId = await getUserId(adminCtx, USERS.editor.username);

    const restrictRes = await adminCtx.patch(`/api/auth/users/${editorId}/zones`, {
      data: { zones: [ZONES.testLocal] },
    });
    expect(restrictRes.ok()).toBeTruthy();

    const allowedRes = await editorCtx.get(`/api/zones/${ZONES.testLocal}`);
    expect(allowedRes.status()).toBe(200);

    const deniedRes = await editorCtx.get(`/api/zones/${ZONES.exampleTest}`);
    expect(deniedRes.status()).toBe(403);

    await adminCtx.dispose();
    await editorCtx.dispose();
  });

  test('admin is never zone-restricted', async () => {
    const adminCtx = await loginAs(USERS.admin.username, USERS.admin.password);
    const adminId = await getUserId(adminCtx, USERS.admin.username);

    await adminCtx.patch(`/api/auth/users/${adminId}/zones`, {
      data: { zones: [ZONES.testLocal] },
    });

    const res = await adminCtx.get(`/api/zones/${ZONES.exampleTest}`);
    expect(res.status()).toBe(200);

    await adminCtx.patch(`/api/auth/users/${adminId}/zones`, {
      data: { zones: [] },
    });
    await adminCtx.dispose();
  });

  test('unrestricted user can access all their key zones', async () => {
    const editorCtx = await loginAs(USERS.editor.username, USERS.editor.password);

    const res1 = await editorCtx.get(`/api/zones/${ZONES.testLocal}`);
    expect(res1.status()).toBe(200);

    const res2 = await editorCtx.get(`/api/zones/${ZONES.exampleTest}`);
    expect(res2.status()).toBe(200);

    await editorCtx.dispose();
  });

  test('zone restriction is enforced on write operations', async () => {
    const adminCtx = await loginAs(USERS.admin.username, USERS.admin.password);
    const editorCtx = await loginAs(USERS.editor.username, USERS.editor.password);
    const editorId = await getUserId(adminCtx, USERS.editor.username);

    await adminCtx.patch(`/api/auth/users/${editorId}/zones`, {
      data: { zones: [ZONES.testLocal] },
    });

    const denyRes = await editorCtx.post(`/api/zones/${ZONES.exampleTest}/records`, {
      data: {
        record: { name: 'zone-access-test', type: 'A', value: '1.2.3.4', ttl: 300 },
      },
    });
    expect(denyRes.status()).toBe(403);

    await adminCtx.dispose();
    await editorCtx.dispose();
  });
});
