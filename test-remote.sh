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

# Get the server's LAN IP (first non-loopback IP)
LAN_IP=$(hostname -I | awk '{print $1}')

echo "Detected LAN IP: $LAN_IP"
echo ""

# Export environment variables
# Frontend will use hostname for API calls
export REACT_APP_API_URL="http://${HOSTNAME}:3002"

# Backend will accept CORS from both hostname and IP (for flexibility)
export ALLOWED_ORIGINS="http://${HOSTNAME}:3001,http://${LAN_IP}:3001"

# Run the standard setup script
./test-setup.sh

echo ""
echo "========================================"
echo "  Remote Access Configured!"
echo "========================================"
echo ""
echo "Access your test environment at:"
echo "  Frontend: http://${HOSTNAME}:3001 (or http://${LAN_IP}:3001)"
echo "  Backend:  http://${HOSTNAME}:3002 (or http://${LAN_IP}:3002)"
echo "  DNS:      ${HOSTNAME}:5353 (or ${LAN_IP}:5353)"
echo ""
echo "Note: CORS is configured to accept requests from both URLs"
echo ""
