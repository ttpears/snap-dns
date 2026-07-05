// backend/src/server.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import FileStore from 'session-file-store';
import { requestLogger } from './middleware/logging';
import { getAllowedOrigins, isOriginAllowed } from './middleware/corsOrigin';
import { generalApiLimiter } from './middleware/rateLimiter';
import { userService } from './services/userService';
import { tsigKeyService } from './services/tsigKeyService';
import { backupService } from './services/backupService';
import { webhookConfigService } from './services/webhookConfigService';
import { ssoConfigService } from './services/ssoConfigService';
import authRoutes from './routes/authRoutes';
import ssoAuthRoutes from './routes/ssoAuthRoutes';
import zoneRoutes from './routes/zoneRoutes';
import keyRoutes from './routes/keyRoutes';
import webhookRoutes from './routes/webhookRoutes';
import tsigKeyRoutes from './routes/tsigKeyRoutes';
import backupRoutes from './routes/backupRoutes';
import webhookConfigRoutes from './routes/webhookConfigRoutes';
import ssoConfigRoutes from './routes/ssoConfigRoutes';
import auditRoutes from './routes/auditRoutes';
import { config } from './config';
import { resolveSessionSecret } from './config/secrets';
import { isCookieSecure } from './config/securityToggles';
import { readFileSync } from 'fs';

// Application version, read from package.json (present next to dist/ at runtime).
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

// Load environment variables first
const NODE_ENV = process.env.NODE_ENV || 'development';
dotenv.config(); // Load default .env
dotenv.config({ path: path.resolve(__dirname, `../.env.${NODE_ENV}`) }); // Load environment specific .env

/**
 * Options for {@link createApp}. Tests inject an in-memory `sessionStore` so
 * they never touch the on-disk file store; production leaves it undefined and
 * the default file store (under `data/sessions`) is used.
 */
export interface CreateAppOptions {
  sessionStore?: session.Store;
}

/**
 * Build the fully-configured Express app WITHOUT binding a port. Extracted from
 * the listen path so integration tests can import the real middleware chain and
 * drive it with supertest. `server.ts` run as an entrypoint still constructs the
 * same app and calls `app.listen()` (see the bottom of this file), so runtime
 * behavior is unchanged.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  // Create express app
  const app: Express = express();
  app.set('trust proxy', 1);

  // Session store configuration. Default to the on-disk file store; tests pass
  // an in-memory store via options to stay isolated and repeatable.
  let sessionStore = options.sessionStore;
  if (!sessionStore) {
    const SessionFileStore = FileStore(session);
    sessionStore = new SessionFileStore({
      path: path.join(process.cwd(), 'data', 'sessions'),
      ttl: 86400, // 24 hours
      retries: 0
    });
  }

  // CORS configuration: production uses ALLOWED_ORIGINS exclusively;
  // development/test use the known dev origins plus ALLOWED_ORIGINS.
  const allowedOrigins = getAllowedOrigins(NODE_ENV, process.env.ALLOWED_ORIGINS);
  const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    if (NODE_ENV === 'production') {
      console.warn(`Rejected CORS request from origin: ${origin}`);
    } else {
      console.warn(`CORS: rejected ${NODE_ENV}-mode request from origin ${origin}; allowed origins are [${allowedOrigins.join(', ')}] - set ALLOWED_ORIGINS to add yours`);
    }
    callback(new Error(`CORS not allowed for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'x-dns-server',
    'x-dns-key-id',
    'x-dns-key-name',
    'x-dns-key-secret',
    'x-dns-key-value',
    'x-dns-algorithm',
    'x-dns-key-algorithm'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Session middleware - must be before routes
app.use(session({
  store: sessionStore,
  // Fail fast in production if SESSION_SECRET is unset (see config/secrets.ts):
  // a source-public fallback secret would allow session forgery.
  secret: resolveSessionSecret(),
  resave: false,
  saveUninitialized: false,
  name: 'snap-dns.sid',
  cookie: {
    httpOnly: true,
    // Secure (HTTPS-only) by default; opt out with COOKIE_SECURE=false for local
    // HTTP dev. A Secure cookie is NOT sent over plain HTTP, so leaving this ON
    // while serving over http:// makes the session appear not to persist.
    secure: isCookieSecure(),
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '10mb' }));
app.use(express.raw({ type: 'application/dns-message', limit: '512b' }));
app.use(requestLogger);

// Apply general rate limiting to all API endpoints
app.use('/api', generalApiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/sso', ssoAuthRoutes);
app.use('/api/tsig-keys', tsigKeyRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/webhook-config', webhookConfigRoutes);
app.use('/api/sso-config', ssoConfigRoutes);
app.use('/api/audit', auditRoutes);

// Health check endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'snap-dns-backend',
    version: APP_VERSION,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'snap-dns-backend',
    version: APP_VERSION,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Snap DNS API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health or /api/health',
      auth: '/api/auth/*',
      zones: '/api/zones/*',
      keys: '/api/tsig-keys/*',
      webhook: '/api/webhook/*',
      backups: '/api/backups/*',
      webhookConfig: '/api/webhook-config/*'
    }
  });
});

// Error handling
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

  return app;
}

// Start server
const startServer = async () => {
  try {
    // Build the production app (default on-disk session store).
    const app = createApp();

    // Initialize services
    console.log('Initializing user service...');
    await userService.initialize();

    console.log('Initializing TSIG key service...');
    await tsigKeyService.initialize();

    console.log('Initializing backup service...');
    await backupService.initialize();

    console.log('Initializing webhook config service...');
    await webhookConfigService.initialize();

    console.log('Initializing SSO config service...');
    await ssoConfigService.initialize();

    // Single source of truth (config defaults host to 0.0.0.0 so the server
    // is reachable inside containers, per the documented default).
    const { host, port } = config;

    app.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
      console.log('Environment:', NODE_ENV);
      console.log('Config:', {
        host,
        port,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
        maxRequestSize: process.env.MAX_REQUEST_SIZE,
        sessionStore: 'file-based',
        sessionTTL: '24 hours'
      });
      console.log('✅ Authentication system ready');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server only when this module is executed directly (node dist/server.js).
// When imported (e.g. by integration tests via createApp), do NOT bind a port.
if (require.main === module) {
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default createApp;
