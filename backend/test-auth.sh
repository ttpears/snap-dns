#!/bin/bash
# backend/test-auth.sh
# Test script for authentication endpoints

BASE_URL="${1:-http://localhost:3002}"

echo "🧪 Testing Snap DNS Authentication System"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Check session status (should be unauthenticated)
echo "1️⃣  Testing session status (before login)..."
SESSION_RESPONSE=$(curl -s -c cookies.txt "$BASE_URL/api/auth/session")
echo "Response: $SESSION_RESPONSE"
echo ""

# Test 2: Login with default admin credentials
echo "2️⃣  Logging in with default admin credentials..."
LOGIN_RESPONSE=$(curl -s -b cookies.txt -c cookies.txt \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}')
echo "Response: $LOGIN_RESPONSE"
echo ""

# Test 3: Check session status (should be authenticated)
echo "3️⃣  Testing session status (after login)..."
SESSION_RESPONSE=$(curl -s -b cookies.txt "$BASE_URL/api/auth/session")
echo "Response: $SESSION_RESPONSE"
echo ""

# Test 4: Try to access protected zone endpoint
echo "4️⃣  Testing protected zone endpoint..."
ZONE_RESPONSE=$(curl -s -b cookies.txt \
  -H "x-dns-server: localhost" \
  -H "x-dns-key-name: testkey" \
  -H "x-dns-key-value: testvalue" \
  -H "x-dns-algorithm: hmac-sha256" \
  "$BASE_URL/api/zones/example.com" || echo "{\"error\":\"Request failed\"}")
echo "Response: $ZONE_RESPONSE"
echo ""

# Test 5: Logout
echo "5️⃣  Logging out..."
LOGOUT_RESPONSE=$(curl -s -b cookies.txt -c cookies.txt \
  -X POST "$BASE_URL/api/auth/logout")
echo "Response: $LOGOUT_RESPONSE"
echo ""

# Test 6: Try to access protected endpoint after logout (should fail)
echo "6️⃣  Testing protected endpoint after logout (should fail)..."
ZONE_RESPONSE=$(curl -s -b cookies.txt \
  -H "x-dns-server: localhost" \
  -H "x-dns-key-name: testkey" \
  -H "x-dns-key-value: testvalue" \
  -H "x-dns-algorithm: hmac-sha256" \
  "$BASE_URL/api/zones/example.com")
echo "Response: $ZONE_RESPONSE"
echo ""

# Cleanup
rm -f cookies.txt

echo "✅ Authentication test complete!"
echo ""
echo "📝 Default credentials:"
echo "   Username: admin"
echo "   Password: changeme123"
echo ""
echo "⚠️  CHANGE THE DEFAULT PASSWORD IMMEDIATELY!"
