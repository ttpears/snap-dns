import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config';
import { requestLogger } from './middleware/logging';
import zoneRoutes from './routes/zoneRoutes';
import keyRoutes from './routes/keyRoutes';
import webhookRoutes from './routes/webhookRoutes';

// Load environment variables first
dotenv.config();

// Create express app
const app: Express = express();

// Debug middleware to log ALL requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('Incoming request:', {
    method: req.method,
    url: req.url,
    path: req.path,
    body: req.body,
    query: req.query
  });
  next();
});

// Default configuration
const DEFAULT_CONFIG = {
  maxRequestSize: '10mb',
  allowedOrigins: ['http://localhost:3001']
};

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = config?.allowedOrigins || DEFAULT_CONFIG.allowedOrigins;
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: config?.maxRequestSize || DEFAULT_CONFIG.maxRequestSize }));
app.use(express.raw({ type: 'application/dns-message', limit: '512b' }));
app.use(requestLogger);

// Routes
app.use('/api/zones', zoneRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/webhook', webhookRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const startServer = async () => {
  try {
    const port = config?.port || parseInt(process.env.BACKEND_PORT || '3002', 10);
    const host = config?.host || process.env.BACKEND_HOST || 'localhost';

    app.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Config:', {
        host,
        port,
        allowedOrigins: config?.allowedOrigins || DEFAULT_CONFIG.allowedOrigins,
        maxRequestSize: config?.maxRequestSize || DEFAULT_CONFIG.maxRequestSize
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
