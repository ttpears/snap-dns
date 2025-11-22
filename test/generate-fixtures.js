#!/usr/bin/env node
// test/generate-fixtures.js
// Generates test data fixtures with properly hashed passwords and encrypted TSIG keys

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const SALT_ROUNDS = 12;
const ENCRYPTION_KEY = 'test-encryption-key-32-chars!!';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt TSIG key value
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Generate test users
 */
async function generateUsers() {
  console.log('Generating test users...');

  const users = [
    {
      id: 'user-admin-001',
      username: 'admin',
      password: 'changeme123',
      role: 'admin',
      email: 'admin@test.local',
      allowedKeyIds: ['key-001', 'key-002', 'key-003']
    },
    {
      id: 'user-editor-001',
      username: 'editor',
      password: 'editor123',
      role: 'editor',
      email: 'editor@test.local',
      allowedKeyIds: ['key-001', 'key-002']
    },
    {
      id: 'user-viewer-001',
      username: 'viewer',
      password: 'viewer123',
      role: 'viewer',
      email: 'viewer@test.local',
      allowedKeyIds: ['key-001']
    }
  ];

  const usersWithHashes = [];

  for (const user of users) {
    console.log(`  Hashing password for ${user.username}...`);
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

    usersWithHashes.push({
      id: user.id,
      username: user.username,
      passwordHash: passwordHash,
      role: user.role,
      email: user.email,
      createdAt: new Date().toISOString(),
      allowedKeyIds: user.allowedKeyIds
    });
  }

  return usersWithHashes;
}

/**
 * Generate test TSIG keys
 */
function generateTSIGKeys() {
  console.log('Generating test TSIG keys...');

  const keys = [
    {
      id: 'key-001',
      name: 'Test Local Zone Key',
      server: '172.30.0.10',
      keyName: 'snap-dns-test-key',
      keyValue: 'yUJ6tgH1O0mbVLNBhCcuNPlWNcb74vGSehzsTbtdiKI=',
      algorithm: 'hmac-sha256',
      zones: ['test.local'],
      createdBy: 'user-admin-001'
    },
    {
      id: 'key-002',
      name: 'Example Test Zone Key',
      server: '172.30.0.10',
      keyName: 'snap-dns-example-key',
      keyValue: 'fVxf9TbJZ0sA+U168anJV0F5TmtU0xE5KEbsqGy6Rhk=',
      algorithm: 'hmac-sha256',
      zones: ['example.test'],
      createdBy: 'user-admin-001'
    },
    {
      id: 'key-003',
      name: 'Demo Zone Key',
      server: '172.30.0.10',
      keyName: 'snap-dns-demo-key',
      keyValue: 'c5uvY5O1HE3f38fCArH+zsBzDcOOR4NYxP0OM035sP8=',
      algorithm: 'hmac-sha256',
      zones: ['demo.local'],
      createdBy: 'user-admin-001'
    }
  ];

  const keysWithEncryption = keys.map(key => {
    console.log(`  Encrypting key: ${key.name}...`);
    return {
      id: key.id,
      name: key.name,
      server: key.server,
      keyName: key.keyName,
      keyValue: encrypt(key.keyValue),
      algorithm: key.algorithm,
      zones: key.zones,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: key.createdBy
    };
  });

  return keysWithEncryption;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('=== Generating Snap DNS Test Fixtures ===\n');

    // Generate users
    const users = await generateUsers();
    const usersFile = path.join(__dirname, 'data', 'users.json');
    await fs.mkdir(path.dirname(usersFile), { recursive: true });
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    console.log(`✓ Users saved to: ${usersFile}\n`);

    // Generate TSIG keys
    const keys = generateTSIGKeys();
    const keysFile = path.join(__dirname, 'data', 'tsig-keys.json');
    await fs.writeFile(keysFile, JSON.stringify(keys, null, 2));
    console.log(`✓ TSIG keys saved to: ${keysFile}\n`);

    // Print login credentials
    console.log('=== Test Login Credentials ===\n');
    console.log('Admin User:');
    console.log('  Username: admin');
    console.log('  Password: changeme123');
    console.log('  Role: admin');
    console.log('  Access: All 3 TSIG keys\n');

    console.log('Editor User:');
    console.log('  Username: editor');
    console.log('  Password: editor123');
    console.log('  Role: editor');
    console.log('  Access: 2 TSIG keys (test.local, example.test)\n');

    console.log('Viewer User:');
    console.log('  Username: viewer');
    console.log('  Password: viewer123');
    console.log('  Role: viewer');
    console.log('  Access: 1 TSIG key (test.local, read-only)\n');

    console.log('=== Pre-configured TSIG Keys ===\n');
    console.log('1. Test Local Zone Key');
    console.log('   Zone: test.local');
    console.log('   Server: 172.30.0.10\n');

    console.log('2. Example Test Zone Key');
    console.log('   Zone: example.test');
    console.log('   Server: 172.30.0.10\n');

    console.log('3. Demo Zone Key');
    console.log('   Zone: demo.local');
    console.log('   Server: 172.30.0.10\n');

    console.log('✓ Test fixtures generated successfully!\n');
  } catch (error) {
    console.error('Error generating fixtures:', error);
    process.exit(1);
  }
}

main();
