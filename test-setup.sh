#!/bin/bash
# test-setup.sh
# Quick start script for Snap DNS test environment

set -e

echo "========================================"
echo "  Snap DNS - Test Environment Setup"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    echo "Please install docker-compose first:"
    echo "  https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js first:"
    echo "  https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}[1/5] Generating test data fixtures...${NC}"
cd test
npm install bcrypt 2>/dev/null || true
node generate-fixtures.js
cd ..

echo ""
echo -e "${GREEN}[2/5] Copying zone files to bind directory...${NC}"
mkdir -p test/data/zones
cp test/bind9/zones/*.zone test/data/zones/

echo ""
echo -e "${GREEN}[3/5] Building Docker images...${NC}"
docker-compose -f docker-compose.test.yml build

echo ""
echo -e "${GREEN}[4/5] Starting test environment...${NC}"
docker-compose -f docker-compose.test.yml up -d

echo ""
echo -e "${GREEN}[5/5] Waiting for services to be ready...${NC}"
echo "  Waiting for DNS server..."
sleep 5

# Wait for DNS server
for i in {1..30}; do
    if docker exec snap-dns-test-server dig @localhost test.local SOA +short > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ DNS server is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "  ${RED}✗ DNS server failed to start${NC}"
        docker-compose -f docker-compose.test.yml logs dns-server
        exit 1
    fi
    sleep 2
done

# Copy zone files into the running container
echo "  Copying zone files to DNS server..."
docker cp test/bind9/zones/test.local.zone snap-dns-test-server:/var/lib/bind/test.local.zone
docker cp test/bind9/zones/example.test.zone snap-dns-test-server:/var/lib/bind/example.test.zone
docker cp test/bind9/zones/demo.local.zone snap-dns-test-server:/var/lib/bind/demo.local.zone
docker cp test/bind9/zones/0.30.172.in-addr.arpa.zone snap-dns-test-server:/var/lib/bind/0.30.172.in-addr.arpa.zone

# Reload BIND9 configuration
echo "  Reloading DNS server..."
docker exec snap-dns-test-server rndc reload 2>/dev/null || true

# Wait for backend
echo "  Waiting for backend..."
for i in {1..30}; do
    if curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Backend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "  ${YELLOW}⚠ Backend not responding (this may be normal if health endpoint doesn't exist)${NC}"
        break
    fi
    sleep 2
done

# Wait for frontend
echo "  Waiting for frontend..."
for i in {1..30}; do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Frontend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "  ${YELLOW}⚠ Frontend not responding yet (may still be building)${NC}"
        break
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}========================================"
echo "  Test Environment Ready!"
echo "========================================${NC}"
echo ""
echo "Access the application:"
echo "  Frontend: ${GREEN}http://localhost:3001${NC}"
echo "  Backend:  ${GREEN}http://localhost:3002${NC}"
echo "  DNS:      ${GREEN}localhost:5353${NC} (use dig -p 5353 @localhost)"
echo ""
echo "Test Credentials:"
echo ""
echo "  ${YELLOW}Admin User:${NC}"
echo "    Username: admin"
echo "    Password: changeme123"
echo "    Role: Administrator (full access)"
echo ""
echo "  ${YELLOW}Editor User:${NC}"
echo "    Username: editor"
echo "    Password: editor123"
echo "    Role: Editor (can modify DNS)"
echo ""
echo "  ${YELLOW}Viewer User:${NC}"
echo "    Username: viewer"
echo "    Password: viewer123"
echo "    Role: Viewer (read-only)"
echo ""
echo "Pre-configured Test Zones:"
echo "  • test.local      (TSIG: snap-dns-test-key)"
echo "  • example.test    (TSIG: snap-dns-example-key)"
echo "  • demo.local      (TSIG: snap-dns-demo-key)"
echo ""
echo "Useful Commands:"
echo "  View logs:        docker-compose -f docker-compose.test.yml logs -f"
echo "  Stop environment: docker-compose -f docker-compose.test.yml down"
echo "  Restart:          docker-compose -f docker-compose.test.yml restart"
echo "  Test DNS:         dig -p 5353 @localhost test.local SOA"
echo ""
echo "Documentation: docs/TESTING.md"
echo ""
