import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { config } from './config';
import { requestLogger } from './middleware/logging';
import zoneRoutes from './routes/zoneRoutes';
import keyRoutes from './routes/keyRoutes';
import webhookRoutes from './routes/webhookRoutes';

// Load environment variables first
const NODE_ENV = process.env.NODE_ENV || 'development';
dotenv.config(); // Load default .env
dotenv.config({ path: path.resolve(__dirname, `../.env.${NODE_ENV}`) }); // Load environment specific .env

// Create express app
const app: Express = express();

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
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'];
    console.log('CORS Check:', { origin, allowedOrigins, env: NODE_ENV });
    
    if (NODE_ENV === 'development') {
      callback(null, true);
      return;
    }
    
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

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '10mb' }));
app.use(express.raw({ type: 'application/dns-message', limit: '512b' }));
app.use(requestLogger);

// Routes
app.use('/api/zones', zoneRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/webhook', webhookRoutes);

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
    const port = parseInt(process.env.BACKEND_PORT || '3002', 10);
    const host = process.env.BACKEND_HOST || 'localhost';

    app.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
      console.log('Environment:', NODE_ENV);
      console.log('Config:', {
        host,
        port,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
        maxRequestSize: process.env.MAX_REQUEST_SIZE
      });
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
