#!/bin/bash
# Test script to verify TSIG keys are fetched after login

echo "Testing TSIG keys fix..."
echo ""

# Step 1: Login
echo "1. Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}' \
  -c /tmp/test-cookies.txt)

echo "$LOGIN_RESPONSE" | jq '.'
echo ""

# Check if login was successful
if echo "$LOGIN_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✓ Login successful"
else
  echo "✗ Login failed"
  exit 1
fi
echo ""

# Step 2: Fetch TSIG keys
echo "2. Fetching TSIG keys..."
KEYS_RESPONSE=$(curl -s http://localhost:3002/api/tsig-keys -b /tmp/test-cookies.txt)

echo "$KEYS_RESPONSE" | jq '.'
echo ""

# Check if keys were fetched
KEY_COUNT=$(echo "$KEYS_RESPONSE" | jq '.keys | length')
if [ "$KEY_COUNT" -gt 0 ]; then
  echo "✓ Successfully fetched $KEY_COUNT keys"
  echo ""
  echo "Keys available:"
  echo "$KEYS_RESPONSE" | jq -r '.keys[] | "  - \(.name) (\(.server)) - Zones: \(.zones | join(", "))"'
else
  echo "✗ No keys returned"
  exit 1
fi

echo ""
echo "✓ Test completed successfully!"
echo ""
echo "The fix is working. Keys are:"
echo "  1. Being returned by the backend API"
echo "  2. Ready to be displayed in the frontend sidebar"
echo ""
echo "To test in the browser:"
echo "  1. Open http://localhost:3001"
echo "  2. Login with admin / changeme123"
echo "  3. Check the sidebar - you should see 3 keys in the dropdown"
echo "  4. Select a key to see available zones"
