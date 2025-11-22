# Authentication System

This document describes the authentication and authorization system implemented in Snap DNS.

## Overview

The application now uses **session-based authentication** with the following features:

- ✅ User accounts with username/password
- ✅ Role-based access control (RBAC)
- ✅ Per-user TSIG key access control
- ✅ HTTP-only cookies for session management
- ✅ Rate limiting on login attempts
- ✅ File-based session storage (persistent across restarts)
- ✅ Bcrypt password hashing with 12 rounds

## User Roles

### Admin
- Full access to all features
- Can manage users (create, delete, modify)
- Access to all TSIG keys
- Can perform all DNS operations

### Editor
- Can read and modify DNS records
- Limited to assigned TSIG keys only
- Cannot manage users

### Viewer
- Read-only access to DNS records
- Limited to assigned TSIG keys only
- Cannot make any changes

## Default Credentials

On first startup, a default admin account is created:

```
Username: admin
Password: changeme123
```

**⚠️ IMPORTANT: Change this password immediately after first login!**

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login
Login with username and password.

**Request:**
```json
{
  "username": "admin",
  "password": "changeme123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "user_123...",
    "username": "admin",
    "role": "admin",
    "email": "admin@localhost",
    "allowedKeyIds": []
  }
}
```

**Rate Limit:** 5 attempts per 15 minutes

#### POST /api/auth/logout
Logout and destroy session. Requires authentication.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /api/auth/session
Check if user is authenticated and get current session info.

**Response (Authenticated):**
```json
{
  "authenticated": true,
  "user": {
    "id": "user_123...",
    "username": "admin",
    "role": "admin",
    "allowedKeyIds": []
  }
}
```

**Response (Not Authenticated):**
```json
{
  "authenticated": false
}
```

#### POST /api/auth/change-password
Change your own password. Requires authentication.

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**Requirements:**
- New password must be at least 8 characters
- Current password must be correct

### User Management Endpoints (Admin Only)

#### POST /api/auth/users
Create a new user. Requires admin role.

**Request:**
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "editor",
  "email": "user@example.com",
  "allowedKeyIds": ["key_abc123"]
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_456...",
    "username": "newuser",
    "role": "editor",
    "email": "user@example.com",
    "allowedKeyIds": ["key_abc123"]
  }
}
```

#### GET /api/auth/users
List all users. Requires admin role.

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "user_123...",
      "username": "admin",
      "role": "admin",
      "allowedKeyIds": []
    }
  ]
}
```

#### DELETE /api/auth/users/:userId
Delete a user. Requires admin role.

**Note:** You cannot delete your own account.

## Protected Routes

All DNS operation routes now require authentication:

- `GET /api/zones/:zone` - View zone records (all authenticated users)
- `POST /api/zones/:zone/records` - Add record (editors and admins only)
- `DELETE /api/zones/:zone/records` - Delete record (editors and admins only)

Additionally, users can only access zones for which they have the corresponding TSIG key access.

## Session Management

- **Session Duration:** 24 hours
- **Session Storage:** File-based in `data/sessions/`
- **Cookie Name:** `snap-dns.sid`
- **Cookie Properties:**
  - `httpOnly: true` - Not accessible via JavaScript
  - `secure: true` (production only) - HTTPS only
  - `sameSite: 'lax'` - CSRF protection

## Environment Variables

Add the following to your `.env` file:

```bash
# Session secret for signing cookies
# Generate with: openssl rand -base64 32
SESSION_SECRET=your-random-secret-here

# Other backend config
BACKEND_PORT=3002
BACKEND_HOST=localhost
ALLOWED_ORIGINS=http://localhost:3001
NODE_ENV=development
```

## Testing on Localhost

1. **Start the backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Run the test script:**
   ```bash
   cd backend
   ./test-auth.sh http://localhost:3002
   ```

3. **Manual testing with curl:**
   ```bash
   # Login
   curl -c cookies.txt -X POST http://localhost:3002/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"changeme123"}'

   # Check session
   curl -b cookies.txt http://localhost:3002/api/auth/session

   # Access protected route
   curl -b cookies.txt http://localhost:3002/api/zones/example.com \
     -H "x-dns-server: localhost" \
     -H "x-dns-key-name: testkey" \
     -H "x-dns-key-value: testvalue" \
     -H "x-dns-algorithm: hmac-sha256"

   # Logout
   curl -b cookies.txt -c cookies.txt -X POST http://localhost:3002/api/auth/logout
   ```

## Security Features

### Implemented
- ✅ Session-based authentication with HTTP-only cookies
- ✅ Bcrypt password hashing (12 rounds)
- ✅ Rate limiting on login attempts (5 per 15 min)
- ✅ Role-based access control (RBAC)
- ✅ Per-user key access control
- ✅ CSRF protection via SameSite cookies
- ✅ Secure cookies in production (HTTPS only)

### Best Practices
- Use strong, unique passwords (minimum 8 characters)
- Change default admin password immediately
- Use HTTPS in production
- Set a strong SESSION_SECRET (use `openssl rand -base64 32`)
- Regularly audit user accounts and permissions
- Monitor failed login attempts

## User Data Storage

User data is stored in `backend/data/users.json`:
- Passwords are hashed with bcrypt (never stored in plaintext)
- File permissions should be restricted (600)
- Backup this file regularly

## Troubleshooting

### "Authentication required" errors
- Ensure you're logged in via `/api/auth/login`
- Check that cookies are being sent with requests
- Verify session hasn't expired (24 hours)

### "Insufficient permissions" errors
- Check your user role (`GET /api/auth/session`)
- Viewers cannot make changes (read-only)
- Non-admins cannot manage users

### "Key access denied" errors
- Your user account needs access to specific TSIG keys
- Contact an admin to grant key access via `allowedKeyIds`
- Admins have access to all keys automatically

### Can't login with default credentials
- Check backend logs for user initialization
- Verify `data/users.json` exists and contains admin user
- Delete `data/users.json` to recreate default admin (⚠️ loses all users)

## Migration from Old System

The old system stored TSIG keys in browser localStorage. To migrate:

1. Note down all your TSIG key configurations
2. Create user accounts for each person who needs access
3. Add TSIG keys server-side (implementation TODO - see task #2)
4. Assign key access to users via `allowedKeyIds`
5. Update frontend to use authentication endpoints

## Next Steps

See the TODO list in CLAUDE.md for pending improvements:
- Task #2: Move TSIG key storage to server-side
- Task #3: Remove TSIG keys from HTTP headers
- Task #11: Implement audit logging
- Task #12: Add request validation middleware
