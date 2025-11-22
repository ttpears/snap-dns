# Snap DNS - Testing Guide

This guide explains how to use the Snap DNS test environment for development and testing without needing a real DNS infrastructure.

## Quick Start

The easiest way to get started is to use the automated setup script:

```bash
./test-setup.sh
```

This script will:
1. Generate test data fixtures (users and TSIG keys)
2. Copy zone files to the appropriate locations
3. Build Docker images
4. Start all services (DNS server, backend, frontend)
5. Wait for all services to be ready

**Access the application at:** http://localhost:3001

## Remote Access Setup

If you need to access the test environment remotely (e.g., from `foo.example.com`):

### Quick Method
```bash
./test-remote.sh foo.example.com
```

### Manual Method
```bash
# Set your hostname
export REACT_APP_API_URL=http://foo.example.com:3002
export ALLOWED_ORIGINS=http://foo.example.com:3001

# Run setup
./test-setup.sh
```

### Using .env File
```bash
# Copy the example file
cp .env.test.example .env.test

# Edit .env.test with your hostname
nano .env.test

# Load environment and run
set -a && source .env.test && set +a
./test-setup.sh
```

**Access at:** http://foo.example.com:3001

## Test Environment Architecture

The test environment consists of three Docker containers:

### 1. DNS Server (BIND9)
- **Container:** `snap-dns-test-server`
- **Image:** `ubuntu/bind9:latest`
- **Internal IP:** 172.30.0.10
- **Host Access:** localhost:5353 (DNS on port 5353)
- **Purpose:** Mock DNS server with pre-configured test zones

### 2. Backend API
- **Container:** `snap-dns-test-backend`
- **Internal IP:** 172.30.0.20
- **Host Access:** localhost:3002
- **Purpose:** Snap DNS backend with test configuration

### 3. Frontend
- **Container:** `snap-dns-test-frontend`
- **Internal IP:** 172.30.0.30
- **Host Access:** localhost:3001
- **Purpose:** React frontend in development mode

## Test Credentials

### Users

Three test users are pre-configured with different permission levels:

#### Admin User (Full Access)
- **Username:** `admin`
- **Password:** `changeme123`
- **Role:** Administrator
- **Permissions:**
  - Full access to all features
  - Can manage users
  - Can manage TSIG keys
  - Can add/edit/delete DNS records
  - Access to all 3 test zones

#### Editor User (Edit Access)
- **Username:** `editor`
- **Password:** `editor123`
- **Role:** Editor
- **Permissions:**
  - Can add/edit/delete DNS records
  - Cannot manage users or TSIG keys
  - Access to 2 test zones (test.local, example.test)

#### Viewer User (Read-Only)
- **Username:** `viewer`
- **Password:** `viewer123`
- **Role:** Viewer
- **Permissions:**
  - Read-only access to DNS records
  - Cannot modify anything
  - Access to 1 test zone (test.local)

### TSIG Keys

Three TSIG keys are pre-configured and already added to the system:

#### 1. Test Local Zone Key
- **Key Name:** snap-dns-test-key
- **Algorithm:** hmac-sha256
- **Secret:** `yUJ6tgH1O0mbVLNBhCcuNPlWNcb74vGSehzsTbtdiKI=`
- **Zone:** test.local
- **Server:** 172.30.0.10

#### 2. Example Test Zone Key
- **Key Name:** snap-dns-example-key
- **Algorithm:** hmac-sha256
- **Secret:** `fVxf9TbJZ0sA+U168anJV0F5TmtU0xE5KEbsqGy6Rhk=`
- **Zone:** example.test
- **Server:** 172.30.0.10

#### 3. Demo Zone Key
- **Key Name:** snap-dns-demo-key
- **Algorithm:** hmac-sha256
- **Secret:** `c5uvY5O1HE3f38fCArH+zsBzDcOOR4NYxP0OM035sP8=`
- **Zone:** demo.local
- **Server:** 172.30.0.10

**Note:** These keys are encrypted at rest in the backend using AES-256-CBC encryption.

## Test Zones

### test.local
Comprehensive test zone with various record types:
- **NS records:** ns1.test.local, ns2.test.local
- **A records:** www, mail, ftp, web1, web2, ldap, xmpp, api, cdn
- **AAAA records:** www, mail, ipv6only
- **CNAME records:** webserver, mailserver, blog
- **MX records:** mail.test.local (priority 10), backup-mail.test.local (priority 20)
- **TXT records:** SPF, DMARC, DKIM
- **SRV records:** HTTP, LDAP, XMPP
- **Wildcard:** *.wild.test.local

### example.test
Production-like zone for testing realistic scenarios:
- **A records:** www, shop, blog, db, cache, api
- **MX records:** mail.example.test, mail2.example.test
- **TXT records:** SPF, Google site verification
- **CAA records:** Let's Encrypt certificate authorization
- **CNAME records:** store, articles

### demo.local
Simple zone for basic testing:
- **NS record:** ns1.demo.local
- **A records:** www, mail
- **MX record:** mail.demo.local
- **TXT record:** Simple description

### Reverse DNS Zone
- **Zone:** 0.30.172.in-addr.arpa
- **PTR records:** For 172.30.0.0/24 network

## Testing Workflows

### 1. Basic DNS Record Management

```bash
# Login as admin
# Navigate to test.local zone
# Try adding a new A record:
#   Hostname: test
#   Type: A
#   Value: 192.168.1.50
#   TTL: 3600

# Verify using dig:
dig -p 5353 @localhost test.test.local A
```

### 2. Testing Record Types

Test all supported record types:
- **A records:** IPv4 addresses
- **AAAA records:** IPv6 addresses
- **CNAME records:** Aliases
- **MX records:** Mail servers (priority value)
- **TXT records:** Text data (auto-quoted)
- **SRV records:** Service locators (priority weight port target)
- **NS records:** Name servers
- **PTR records:** Reverse DNS
- **CAA records:** Certificate authority authorization

### 3. Testing User Permissions

#### Test Admin Permissions
```bash
# Login as admin (changeme123)
# Go to Settings
# You should see:
#   - TSIG Key Management (can add/edit/delete keys)
#   - User Management (if implemented)
#   - All zones visible
```

#### Test Editor Permissions
```bash
# Login as editor (editor123)
# Go to Settings
# You should see:
#   - TSIG Key Management is read-only or hidden
#   - Can view test.local and example.test zones
#   - Cannot view demo.local zone
#   - Can add/edit/delete records in allowed zones
```

#### Test Viewer Permissions
```bash
# Login as viewer (viewer123)
# You should see:
#   - Only test.local zone is visible
#   - All buttons for add/edit/delete are disabled
#   - Can view records but cannot modify
```

### 4. Testing Bulk Operations

```bash
# Login as admin
# Navigate to test.local
# Try adding multiple records
# Use pending changes drawer to review
# Apply all at once
# Verify atomicity (all succeed or all fail)
```

### 5. Testing Validation

Try invalid inputs to test validation:
- Invalid IPv4: `999.999.999.999`
- Invalid IPv6: `zzz::1`
- Invalid hostname: `invalid..hostname`
- Invalid MX: Missing priority
- Invalid SRV: Incomplete format

### 6. Testing Rate Limiting

```bash
# Make rapid requests to test rate limiting:
# - 30 queries/min for zone reads
# - 10 modifications/min for DNS changes
# - 10 operations/5min for key management

# Use curl or a script to test:
for i in {1..35}; do
  curl -c cookies.txt -b cookies.txt http://localhost:3002/api/zones/test.local
  echo "Request $i"
done
```

### 7. Testing Webhooks

```bash
# Login as admin
# Go to Settings → Webhooks
# Add a test webhook (use webhook.site for testing)
# Make DNS changes
# Verify webhook is triggered
```

### 8. Testing Backup/Restore

```bash
# Login as admin
# Navigate to a zone
# Create a snapshot
# Make some changes
# Compare with snapshot
# Restore from snapshot
# Verify changes are reverted
```

## DNS Testing from Command Line

### Query DNS Server

```bash
# Query A record
dig -p 5353 @localhost test.local A

# Query all records for a zone (AXFR - zone transfer)
dig -p 5353 @localhost test.local AXFR

# Query specific record
dig -p 5353 @localhost www.test.local A

# Query MX records
dig -p 5353 @localhost test.local MX

# Query IPv6 (AAAA)
dig -p 5353 @localhost www.test.local AAAA

# Query TXT records
dig -p 5353 @localhost test.local TXT
```

### Update DNS Records with nsupdate

You can also test direct nsupdate operations:

```bash
# Create a key file
cat > test.key << EOF
key snap-dns-test-key {
  algorithm hmac-sha256;
  secret "yUJ6tgH1O0mbVLNBhCcuNPlWNcb74vGSehzsTbtdiKI=";
};
EOF

# Create nsupdate commands
cat > update.txt << EOF
server localhost 5353
zone test.local
update add testnew.test.local 3600 A 192.168.1.99
send
EOF

# Execute nsupdate
nsupdate -k test.key update.txt

# Verify
dig -p 5353 @localhost testnew.test.local A
```

## Docker Commands

### View Logs

```bash
# All services
docker-compose -f docker-compose.test.yml logs -f

# Specific service
docker-compose -f docker-compose.test.yml logs -f dns-server
docker-compose -f docker-compose.test.yml logs -f backend
docker-compose -f docker-compose.test.yml logs -f frontend
```

### Restart Services

```bash
# Restart all
docker-compose -f docker-compose.test.yml restart

# Restart specific service
docker-compose -f docker-compose.test.yml restart backend
```

### Stop Environment

```bash
# Stop containers (keep data)
docker-compose -f docker-compose.test.yml stop

# Stop and remove containers (keep data)
docker-compose -f docker-compose.test.yml down

# Stop and remove everything including volumes
docker-compose -f docker-compose.test.yml down -v
```

### Start Again

```bash
# Start existing containers
docker-compose -f docker-compose.test.yml start

# Or run full setup again
./test-setup.sh
```

### Access Container Shells

```bash
# DNS server
docker exec -it snap-dns-test-server bash

# Backend
docker exec -it snap-dns-test-backend sh

# Frontend
docker exec -it snap-dns-test-frontend sh
```

### Inspect DNS Server

```bash
# Check BIND9 configuration
docker exec snap-dns-test-server cat /etc/bind/named.conf

# Check zone files
docker exec snap-dns-test-server ls -la /var/lib/bind/

# Check BIND9 status
docker exec snap-dns-test-server rndc status

# Reload zones
docker exec snap-dns-test-server rndc reload
```

## Troubleshooting

### DNS Server Not Starting

```bash
# Check DNS server logs
docker-compose -f docker-compose.test.yml logs dns-server

# Check BIND9 configuration
docker exec snap-dns-test-server named-checkconf

# Check zone files
docker exec snap-dns-test-server named-checkzone test.local /var/lib/bind/test.local.zone
```

### Backend Not Connecting to DNS

```bash
# Check network connectivity
docker exec snap-dns-test-backend ping -c 3 172.30.0.10

# Test DNS resolution from backend
docker exec snap-dns-test-backend dig @172.30.0.10 test.local SOA

# Check backend logs
docker-compose -f docker-compose.test.yml logs backend
```

### Frontend Not Loading

```bash
# Check if backend is accessible from frontend
docker exec snap-dns-test-frontend curl http://172.30.0.20:3002/api/health

# Check frontend logs
docker-compose -f docker-compose.test.yml logs frontend

# Rebuild frontend
docker-compose -f docker-compose.test.yml build frontend
docker-compose -f docker-compose.test.yml up -d frontend
```

### Authentication Not Working

```bash
# Check if user fixtures were generated
ls -la test/data/users.json

# Check backend can read user data
docker exec snap-dns-test-backend cat /app/data/users.json

# Regenerate fixtures
cd test && node generate-fixtures.js && cd ..
docker-compose -f docker-compose.test.yml restart backend
```

### TSIG Keys Not Working

```bash
# Check key file
cat test/bind9/keys/tsig.key

# Check if keys are loaded in BIND9
docker exec snap-dns-test-server named-checkconf -p | grep key

# Test key from backend
docker exec snap-dns-test-backend cat /app/data/tsig-keys.json
```

### Port Conflicts

If ports 3001, 3002, or 5353 are already in use:

```bash
# Find what's using the port
sudo lsof -i :3001
sudo lsof -i :3002
sudo lsof -i :5353

# Stop the conflicting service or edit docker-compose.test.yml to use different ports
```

## Resetting the Test Environment

To completely reset and start fresh:

```bash
# Stop and remove everything
docker-compose -f docker-compose.test.yml down -v

# Remove test data
rm -rf test/data/

# Run setup again
./test-setup.sh
```

## Testing Best Practices

1. **Always test with different user roles** to ensure RBAC works correctly
2. **Test validation** - try invalid inputs to ensure validation catches errors
3. **Test rate limiting** - ensure limits are enforced
4. **Test atomic updates** - ensure DNS operations are atomic (all or nothing)
5. **Test webhooks** - ensure notifications are sent correctly
6. **Test backup/restore** - ensure data can be recovered
7. **Check audit logs** - verify all operations are logged
8. **Test error handling** - try operations that should fail
9. **Test large zones** - create zones with many records to test performance
10. **Test concurrent operations** - multiple users making changes simultaneously

## Continuous Testing

### Automated Testing Script

Create a test script to verify core functionality:

```bash
#!/bin/bash
# test-suite.sh

# Login as admin
curl -c cookies.txt -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'

# Fetch zone
curl -b cookies.txt http://localhost:3002/api/zones/test.local

# Add record
curl -b cookies.txt -X POST http://localhost:3002/api/zones/test.local/records \
  -H "Content-Type: application/json" \
  -d '{"hostname":"auto-test","type":"A","value":"192.168.99.99","ttl":3600}'

# Verify with dig
dig -p 5353 @localhost auto-test.test.local A

# Delete record
curl -b cookies.txt -X DELETE http://localhost:3002/api/zones/test.local/records \
  -H "Content-Type: application/json" \
  -d '{"hostname":"auto-test","type":"A","value":"192.168.99.99"}'

# Logout
curl -b cookies.txt -X POST http://localhost:3002/api/auth/logout

echo "Tests complete!"
```

## Development Workflow

When developing new features:

1. Start test environment: `./test-setup.sh`
2. Make code changes
3. Test in browser at http://localhost:3001
4. Backend auto-reloads (dev mode)
5. Frontend may need manual refresh
6. Check logs: `docker-compose -f docker-compose.test.yml logs -f`
7. Commit changes
8. Run full test suite

## CI/CD Integration

To integrate with CI/CD:

```yaml
# .github/workflows/test.yml example
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Start test environment
        run: ./test-setup.sh
      - name: Run tests
        run: ./test-suite.sh
      - name: Cleanup
        run: docker-compose -f docker-compose.test.yml down -v
```

## Additional Resources

- **Project Documentation:** [CLAUDE.md](../CLAUDE.md)
- **Authentication Guide:** [AUTHENTICATION.md](AUTHENTICATION.md)
- **Main README:** [README.md](../README.md)
- **TSIG Key Reference:** [test/bind9/keys/README.md](../test/bind9/keys/README.md)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review logs: `docker-compose -f docker-compose.test.yml logs`
3. Check GitHub issues
4. Open a new issue with logs and steps to reproduce
