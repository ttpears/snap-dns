# Development Mode with Hot Reload

## Quick Start - Development Mode (FAST!) - DEFAULT

For **active development** with instant hot reload (no rebuilds needed):

```bash
# Start test environment with HOT RELOAD (this is now the DEFAULT)
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.yml up

# Access the application
http://yourhostname.example.com:3001

# Login
Username: admin
Password: admin
```

### What You Get:
- ✅ **Instant Updates**: Edit files in `src/` → browser auto-reloads in <2 seconds
- ✅ **No Rebuilds**: Changes reflected immediately
- ✅ **Full Test Environment**: BIND9 DNS server + backend + frontend
- ✅ **All Features Working**: Authentication, snapshots, DNS operations

### How It Works:
- Frontend: React development server (`npm start`) with hot module replacement
- Backend: ts-node-dev with auto-reload on TypeScript changes
- Source files mounted as volumes - changes detected immediately
- No production build step required

---

## Production Build Mode (SLOW but Production-Like)

For **testing production builds** or final validation:

```bash
# Full production build (takes ~2 minutes)
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.prod.yml up -d --build frontend

# Or rebuild everything
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.prod.yml up -d --build
```

### What You Get:
- ✅ Production-optimized build
- ✅ Minified bundles
- ✅ TypeScript compilation verification
- ❌ ~2 minute rebuild on every code change

### When to Use:
- Final testing before deployment
- Verifying production build issues
- Bundle size analysis
- Not for active development!

---

## Comparison

| Feature | Development Mode (DEFAULT) | Production Mode |
|---------|-----------------|-----------------|
| **File** | `docker-compose.test.yml` | `docker-compose.test.prod.yml` |
| **Startup Time** | ~30 seconds | ~2-3 minutes |
| **Code Changes** | Instant reload (<2s) | Full rebuild (~2 min) |
| **Build Type** | Development server | Production bundle |
| **Hot Reload** | ✅ Yes | ❌ No |
| **TypeScript Check** | On-the-fly | Full compile |
| **Bundle Size** | Unoptimized | Minified |
| **Source Maps** | Full | Limited |
| **Use Case** | Active development | Final testing |

---

## Development Workflow Recommendations

### For Feature Development:
```bash
# 1. Start development mode (DEFAULT - with hot reload)
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.yml up

# 2. Edit files in src/
# 3. Browser auto-reloads with changes
# 4. Iterate quickly

# 5. When done, stop dev mode
docker-compose -f docker-compose.test.yml down

# 6. Test production build once (optional)
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.prod.yml up -d --build
```

### For Bug Fixing:
```bash
# Development mode is fastest (and now the DEFAULT)
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.yml up

# Make changes, test immediately, iterate rapidly
```

### For Final Testing:
```bash
# Production build to catch any build-time issues
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.prod.yml up -d --build
```

---

## Troubleshooting

### Hot Reload Not Working?

**1. Check if volumes are mounted:**
```bash
docker-compose -f docker-compose.test.dev.yml ps
docker inspect snap-dns-test-frontend | grep -A 10 Mounts
```

**2. Check if development server is running:**
```bash
docker logs snap-dns-test-frontend
# Should see: "webpack compiled successfully"
# Should NOT see: "serve -s build"
```

**3. Hard refresh browser:**
- Chrome/Firefox: `Ctrl+Shift+R` or `Cmd+Shift+R`
- Clear browser cache if needed

### TypeScript Errors?

Development mode checks TypeScript on-the-fly but may be more lenient. If you see runtime errors:

```bash
# Run type check manually
npm run build  # This runs tsc --noEmit first
```

### Port Already in Use?

```bash
# Stop all Docker containers first
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.dev.yml down

# Then start dev mode
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.dev.yml up
```

---

## Performance Comparison

### Initial Startup:
- **Dev Mode**: ~30 seconds (npm install cached, start dev server)
- **Production Mode**: ~2-3 minutes (full build + optimization)

### Code Change Iteration:
- **Dev Mode**: <2 seconds (hot module replacement)
- **Production Mode**: ~2 minutes (full rebuild every time)

### For 10 Iterations:
- **Dev Mode**: 30s + (10 × 2s) = **50 seconds total** ⚡
- **Production Mode**: (10 × 2min) = **20 minutes total** 🐌

---

## 💡 Recommendation

**Use Development Mode** (`docker-compose.test.dev.yml`) for:
- All active development work
- Bug fixing
- Feature implementation
- UI tweaks
- Quick iterations

**Use Production Mode** (`docker-compose.test.yml`) for:
- Final testing before deployment
- Bundle size verification
- Production build validation
- Once per development session

**Time Savings**: ~95% faster iteration for active development! 🚀

---

## Example Commands

### Start Development Mode:
```bash
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.dev.yml up
```

### Start Development Mode (Background):
```bash
REACT_APP_API_URL=http://yourhostname.example.com:3002 \
docker-compose -f docker-compose.test.dev.yml up -d

# View logs
docker-compose -f docker-compose.test.dev.yml logs -f frontend
```

### Stop Development Mode:
```bash
docker-compose -f docker-compose.test.dev.yml down
```

### Restart Just Frontend (if needed):
```bash
docker-compose -f docker-compose.test.dev.yml restart frontend
```

---

## 🎉 Summary

You now have **two modes**:

1. **Development Mode** (RECOMMENDED for daily work)
   - File: `docker-compose.test.dev.yml`
   - Hot reload enabled
   - ~2 second iteration time
   - Full test environment

2. **Production Mode** (for final testing)
   - File: `docker-compose.test.yml`
   - Production build
   - ~2 minute rebuild time
   - Production-like environment

Start using development mode for **95% faster development** workflow! 🚀
