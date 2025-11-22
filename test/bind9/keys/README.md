# Test TSIG Keys

These are pre-configured TSIG keys for the test environment.

**⚠️ WARNING: DO NOT use these keys in production!**

## Keys for Testing

### 1. snap-dns-test-key (for test.local zone)
- **Key Name:** snap-dns-test-key
- **Algorithm:** hmac-sha256
- **Secret:** K9tJZ3kF2xL7mN4pQ6rS8tV9wY1aB3cD5eF7gH9jK0lM2nP4qR6sT8uV0wX2yZ4A==
- **DNS Server:** 172.30.0.10 (or localhost:5353 from host)
- **Zone:** test.local

### 2. snap-dns-example-key (for example.test zone)
- **Key Name:** snap-dns-example-key
- **Algorithm:** hmac-sha256
- **Secret:** A1bC3dE5fG7hI9jK0lM2nO4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0pQ==
- **DNS Server:** 172.30.0.10 (or localhost:5353 from host)
- **Zone:** example.test

### 3. snap-dns-demo-key (for demo.local zone)
- **Key Name:** snap-dns-demo-key
- **Algorithm:** hmac-sha256
- **Secret:** B2cD4eF6gH8iJ0kL2mN4oP6qR8sT0uV2wX4yZ6aB8cD0eF2gH4iJ6kL8mN0oP2qR==
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
