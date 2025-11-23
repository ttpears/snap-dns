#!/bin/bash
# test-proxy.sh
# Start test environment configured for reverse proxy with HTTPS

set -e

echo "Starting Snap DNS Test Environment for Proxy/HTTPS"
echo "=================================================="
echo ""
echo "Frontend URL: https://snap-dns-testing.teamgleim.com"
echo "Backend API:  https://snap-dns-testing-api.teamgleim.com"
echo ""
echo "Make sure your reverse proxy is configured to route:"
echo "  - snap-dns-testing.teamgleim.com → http://localhost:3001"
echo "  - snap-dns-testing-api.teamgleim.com → http://localhost:3002"
echo ""

# Set environment variables
export REACT_APP_API_URL=https://snap-dns-testing-api.teamgleim.com
export FRONTEND_URL=https://snap-dns-testing.teamgleim.com
export ALLOWED_ORIGINS=https://snap-dns-testing.teamgleim.com,https://snap-dns-testing-api.teamgleim.com
export WDS_SOCKET_HOST=snap-dns-testing.teamgleim.com
export WDS_SOCKET_PORT=443
export WDS_SOCKET_PATH=/ws
# DO NOT set HTTPS=true - webpack dev server must run HTTP internally

echo "Environment configured:"
echo "  REACT_APP_API_URL=$REACT_APP_API_URL"
echo "  FRONTEND_URL=$FRONTEND_URL"
echo "  ALLOWED_ORIGINS=$ALLOWED_ORIGINS"
echo "  WDS_SOCKET_HOST=$WDS_SOCKET_HOST"
echo ""

# Stop any existing containers
echo "Stopping existing containers..."
docker-compose -f docker-compose.test.yml down 2>/dev/null || true

# Start with new configuration
echo "Starting containers..."
docker-compose -f docker-compose.test.yml up --build -d

echo ""
echo "Containers started!"
echo ""
echo "Configure your reverse proxy (Traefik, Nginx, etc.) to route:"
echo "  1. https://snap-dns-testing.teamgleim.com → http://localhost:3001"
echo "  2. https://snap-dns-testing-api.teamgleim.com → http://localhost:3002"
echo ""
echo "SSO Redirect URIs should be updated to:"
echo "  - Redirect URI: https://snap-dns-testing-api.teamgleim.com/api/auth/sso/callback"
echo "  - Post Logout URI: https://snap-dns-testing.teamgleim.com/login"
echo ""
echo "View logs: docker-compose -f docker-compose.test.yml logs -f"
echo "Stop: docker-compose -f docker-compose.test.yml down"
