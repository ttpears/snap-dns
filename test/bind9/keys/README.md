# Test TSIG Keys

These are pre-configured TSIG keys for the test environment.

**⚠️ WARNING: DO NOT use these keys in production!**

## Keys for Testing

### 1. snap-dns-test-key (for test.local zone)
- **Key Name:** snap-dns-test-key
- **Algorithm:** hmac-sha256
- **Secret:** yUJ6tgH1O0mbVLNBhCcuNPlWNcb74vGSehzsTbtdiKI=
- **DNS Server:** 172.30.0.10 (or localhost:5353 from host)
- **Zone:** test.local

### 2. snap-dns-example-key (for example.test zone)
- **Key Name:** snap-dns-example-key
- **Algorithm:** hmac-sha256
- **Secret:** fVxf9TbJZ0sA+U168anJV0F5TmtU0xE5KEbsqGy6Rhk=
- **DNS Server:** 172.30.0.10 (or localhost:5353 from host)
- **Zone:** example.test

### 3. snap-dns-demo-key (for demo.local zone)
- **Key Name:** snap-dns-demo-key
- **Algorithm:** hmac-sha256
- **Secret:** c5uvY5O1HE3f38fCArH+zsBzDcOOR4NYxP0OM035sP8=
- **DNS Server:** 172.30.0.10 (or localhost:5353 from host)
- **Zone:** demo.local

## How to Add Keys to Snap DNS

1. Login to Snap DNS (http://localhost:3001)
   - Username: admin
   - Password: changeme123

2. Navigate to Settings → TSIG Key Management

3. Click "Add TSIG Key"

4. Fill in the form with one of the keys above

5. Click "Save"

## Quick Start Script

The `test-setup.sh` script automatically creates these keys for you.
