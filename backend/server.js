const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

// Add logging timestamp
const log = (message, ...args) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
};

const error = (message, ...args) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args);
};

const app = express();

// Add request logging middleware
app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  log('Headers:', req.headers);
  log('Query:', req.query);
  log('Body:', req.body);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Add error handling middleware
app.use((err, req, res, next) => {
  error('Unhandled error:', err);
  res.status(500).json({ error: true, message: err.message });
});

app.get('/zone/:zoneName/axfr', async (req, res) => {
  const { zoneName } = req.params;
  const { server, keyName, keyValue, algorithm } = req.query;

  log('Zone transfer request:', {
    zone: zoneName,
    server,
    keyName,
    algorithm,
    hasKeyValue: !!keyValue
  });

  if (!server || !keyName || !keyValue || !algorithm) {
    error('Missing required parameters');
    return res.status(400).json({ 
      error: true, 
      message: 'Missing required TSIG key information',
      missing: {
        server: !server,
        keyName: !keyName,
        keyValue: !keyValue,
        algorithm: !algorithm
      }
    });
  }

  let keyFilePath;
  try {
    keyFilePath = await generateTempKeyFile({
      keyName,
      keyValue,
      algorithm
    });

    const command = `dig +time=10 +tries=1 @${server} ${zoneName} AXFR -k "${keyFilePath}" +multiline`;
    log('Executing command:', command.replace(keyValue, '[REDACTED]'));

    exec(command, { timeout: 15000 }, async (error, stdout, stderr) => {
      log('Dig output:', stdout);
      if (stderr) error('Dig stderr:', stderr);

      // ... rest of the execution handler
    });
  } catch (err) {
    error('AXFR error:', err);
    res.status(500).json({ 
      error: true, 
      message: 'Failed to fetch zone records',
      details: err.message 
    });
  }
});

// Add a test endpoint
app.get('/test', (req, res) => {
  log('Test endpoint called');
  res.json({ status: 'ok', time: new Date() });
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  log(`Server running on http://${HOST}:${PORT}`);
  log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOST: process.env.HOST
  });
}); 