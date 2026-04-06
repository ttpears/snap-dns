// tests/e2e/fixtures/test-data.ts

export const USERS = {
  admin: {
    username: 'admin',
    password: 'changeme123',
    role: 'admin',
    storageStatePath: 'tests/e2e/.auth/admin.json',
  },
  editor: {
    username: 'editor',
    password: 'editor123',
    role: 'editor',
    storageStatePath: 'tests/e2e/.auth/editor.json',
  },
  viewer: {
    username: 'viewer',
    password: 'viewer123',
    role: 'viewer',
    storageStatePath: 'tests/e2e/.auth/viewer.json',
  },
} as const;

export const KEYS = {
  testKey: {
    name: 'Test Local Zone Key',
    zones: ['test.local'],
  },
  exampleKey: {
    name: 'Example Test Zone Key',
    zones: ['example.test'],
  },
  demoKey: {
    name: 'Demo Zone Key',
    zones: ['demo.local'],
  },
} as const;

export const ZONES = {
  testLocal: 'test.local',
  exampleTest: 'example.test',
  demoLocal: 'demo.local',
} as const;

export const RECORD_TYPES = [
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP',
] as const;

export const TEST_RECORDS = {
  a: { name: 'e2e-test-a', type: 'A', value: '10.20.30.40', ttl: 300 },
  aaaa: { name: 'e2e-test-aaaa', type: 'AAAA', value: '2001:db8:0:0:0:0:0:1', ttl: 300 },
  cname: { name: 'e2e-test-cname', type: 'CNAME', value: 'target.test.local', ttl: 300 },
  mx: { name: 'e2e-test-mx', type: 'MX', priority: 10, value: 'mail.test.local', ttl: 300 },
  txt: { name: 'e2e-test-txt', type: 'TXT', value: 'v=spf1 include:test.local ~all', ttl: 300 },
  srv: { name: '_sip._tcp.e2e-test-srv', type: 'SRV', priority: 10, weight: 60, port: 5060, value: 'sip.test.local', ttl: 300 },
  caa: { name: 'e2e-test-caa', type: 'CAA', flags: 0, tag: 'issue', value: 'letsencrypt.org', ttl: 300 },
} as const;
