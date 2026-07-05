// backend/src/routes/__tests__/routeGuards.test.ts
// Verifies auth/write-access middleware is wired onto sensitive routes without
// needing a full HTTP stack (no supertest in this project). We introspect the
// Express router stack and assert the named middleware appears on the route.
import webhookRouter from '../webhookRoutes';
import backupRouter from '../backupRoutes';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: { name: string } }>;
  };
}

function handlerNamesFor(
  router: { stack: RouteLayer[] },
  method: string,
  path: string
): string[] {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer || !layer.route) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer.route.stack.map((s) => s.handle.name);
}

describe('webhook notify route guards', () => {
  it('POST /notify requires auth and write access (SSRF hardening)', () => {
    const names = handlerNamesFor(webhookRouter as never, 'post', '/notify');
    expect(names).toContain('requireAuth');
    expect(names).toContain('requireWriteAccess');
  });
});

describe('backup creation route guards', () => {
  it('POST /zone/:zone requires auth and write access (viewers cannot write backups)', () => {
    const names = handlerNamesFor(backupRouter as never, 'post', '/zone/:zone');
    expect(names).toContain('requireAuth');
    expect(names).toContain('requireWriteAccess');
  });

  it('GET /zone/:zone requires auth but not write access (viewers may read)', () => {
    const names = handlerNamesFor(backupRouter as never, 'get', '/zone/:zone');
    expect(names).toContain('requireAuth');
    expect(names).not.toContain('requireWriteAccess');
  });
});
