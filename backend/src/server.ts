import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import FileStore from 'session-file-store';
import { config } from './config';
import { requestLogger } from './middleware/logging';
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

// Load environment variables first
const NODE_ENV = process.env.NODE_ENV || 'development';
dotenv.config(); // Load default .env
dotenv.config({ path: path.resolve(__dirname, `../.env.${NODE_ENV}`) }); // Load environment specific .env

// Create express app
const app: Express = express();

// Session store configuration
const SessionFileStore = FileStore(session);
const sessionStore = new SessionFileStore({
  path: path.join(process.cwd(), 'data', 'sessions'),
  ttl: 86400, // 24 hours
  retries: 0
});

// Debug middleware to log ALL requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('Incoming request:', {
    method: req.method,
    url: req.url,
    path: req.path,
    origin: req.headers.origin,
    env: NODE_ENV,
    allowedOrigins: process.env.ALLOWED_ORIGINS
  });
  next();
});

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // In test/development, allow all origins
    if (NODE_ENV === 'test' || NODE_ENV === 'development') {
      console.log('CORS Check (permissive):', { origin, env: NODE_ENV });
      callback(null, true);
      return;
    }

    // Production: strict CORS
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    console.log('CORS Check (strict):', { origin, allowedOrigins, env: NODE_ENV });

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Rejected CORS request from origin: ${origin}`);
      callback(new Error(`CORS not allowed for origin: ${origin}`));
    }
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
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'snap-dns.sid',
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
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

// Health check endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'snap-dns-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'snap-dns-backend',
    version: '1.0.0',
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
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const startServer = async () => {
  try {
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

    const port = parseInt(process.env.BACKEND_PORT || '3002', 10);
    const host = process.env.BACKEND_HOST || 'localhost';

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

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
