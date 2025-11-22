#!/bin/bash
# test-remote.sh
# Start test environment with custom hostname for remote access

set -e

echo "========================================"
echo "  Snap DNS - Remote Test Setup"
echo "========================================"
echo ""

# Check if hostname is provided
if [ -z "$1" ]; then
    echo "Usage: ./test-remote.sh <hostname>"
    echo "Example: ./test-remote.sh foo.example.com"
    echo ""
    echo "This will configure the test environment for remote access at:"
    echo "  Frontend: http://<hostname>:3001"
    echo "  Backend:  http://<hostname>:3002"
    exit 1
fi

HOSTNAME=$1

echo "Configuring for remote access at: $HOSTNAME"
echo ""

# Export environment variables
export REACT_APP_API_URL="http://${HOSTNAME}:3002"
export ALLOWED_ORIGINS="http://${HOSTNAME}:3001"

# Run the standard setup script
./test-setup.sh

echo ""
echo "========================================"
echo "  Remote Access Configured!"
echo "========================================"
echo ""
echo "Access your test environment at:"
echo "  Frontend: http://${HOSTNAME}:3001"
echo "  Backend:  http://${HOSTNAME}:3002"
echo "  DNS:      ${HOSTNAME}:5353"
echo ""
