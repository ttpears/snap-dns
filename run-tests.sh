#!/bin/bash
# run-tests.sh
# Script to run Playwright E2E tests for Snap DNS

set -e

echo "================================================"
echo "  Snap DNS - E2E Test Runner"
echo "================================================"
echo ""

# Prefer modern "docker compose" plugin, fall back to docker-compose
if docker compose version &> /dev/null; then
    DC="docker compose"
elif command -v docker-compose &> /dev/null; then
    DC="docker-compose"
else
    echo "Error: Neither 'docker compose' nor 'docker-compose' found"
    exit 1
fi

# Install Playwright if needed
if [ ! -d "node_modules/@playwright" ]; then
    echo "Installing test dependencies..."
    npm install
    echo ""
    echo "Installing Playwright browsers..."
    npx playwright install --with-deps chromium
    echo ""
fi

# Check if docker containers are running
echo "Checking if test environment is running..."
CONTAINERS=$($DC -f docker-compose.test.yml ps -q 2>/dev/null | wc -l)

if [ "$CONTAINERS" -eq 0 ]; then
    echo "Test environment is not running!"
    echo ""
    echo "Please start the test environment first:"
    echo "  ./test-setup.sh"
    echo ""
    exit 1
fi

echo "Test environment is running"
echo ""

# Detect the test URL
if [ -z "$TEST_URL" ]; then
    TEST_URL="http://localhost:3001"
fi

echo "Testing against: $TEST_URL"
echo ""

# Run tests
echo "Running E2E tests..."
echo ""

if [ "$1" == "--headed" ] || [ "$1" == "-h" ]; then
    echo "Running in headed mode (browser visible)..."
    TEST_URL=$TEST_URL npx playwright test --headed "$@"
elif [ "$1" == "--debug" ] || [ "$1" == "-d" ]; then
    echo "Running in debug mode..."
    TEST_URL=$TEST_URL npx playwright test --debug
elif [ "$1" == "--ui" ] || [ "$1" == "-u" ]; then
    echo "Running in UI mode..."
    TEST_URL=$TEST_URL npx playwright test --ui
else
    echo "Running in headless mode..."
    TEST_URL=$TEST_URL npx playwright test "$@"
fi

echo ""
echo "================================================"
echo "  Test run complete!"
echo "================================================"
