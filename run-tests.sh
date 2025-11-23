#!/bin/bash
# run-tests.sh
# Script to run Playwright E2E tests for Snap DNS

set -e

echo "================================================"
echo "  Snap DNS - E2E Test Runner"
echo "================================================"
echo ""

# Check if node_modules exists in test directory
if [ ! -d "node_modules/playwright" ]; then
    echo "📦 Installing test dependencies..."
    npm install --no-save playwright

    echo ""
    echo "🌐 Installing Chromium browser..."
    npx playwright install chromium
    echo ""
fi

# Check if docker containers are running
echo "🔍 Checking if test environment is running..."
CONTAINERS=$(docker-compose -f docker-compose.test.yml ps -q | wc -l)

if [ "$CONTAINERS" -eq 0 ]; then
    echo "⚠️  Test environment is not running!"
    echo ""
    echo "Please start the test environment first:"
    echo "  docker-compose -f docker-compose.test.yml up -d"
    echo ""
    exit 1
fi

echo "✓ Test environment is running"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 3

# Detect the test URL
if [ -z "$TEST_URL" ]; then
    # Try to detect hostname
    if command -v hostname &> /dev/null; then
        HOSTNAME=$(hostname)
        TEST_URL="http://${HOSTNAME}.teamgleim.com:3001"
    else
        TEST_URL="http://localhost:3001"
    fi
fi

echo "🌐 Testing against: $TEST_URL"
echo ""

# Run tests
echo "🚀 Running E2E tests..."
echo ""

if [ "$1" == "--headed" ] || [ "$1" == "-h" ]; then
    echo "Running in headed mode (browser visible)..."
    HEADLESS=false TEST_URL=$TEST_URL node test-dns-operations.js
elif [ "$1" == "--debug" ] || [ "$1" == "-d" ]; then
    echo "Running in debug mode..."
    HEADLESS=false PWDEBUG=1 TEST_URL=$TEST_URL node test-dns-operations.js
else
    echo "Running in headless mode..."
    TEST_URL=$TEST_URL node test-dns-operations.js
fi

echo ""
echo "================================================"
echo "  Test run complete!"
echo "================================================"
