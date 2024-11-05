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

  console.log('AXFR request for:', {
    zone: zoneName,
    dnsServer: server,
    keyName,
    algorithm
  });

  if (!server || !keyName || !keyValue || !algorithm) {
    return res.status(400).json({ 
      error: true, 
      message: 'Missing required TSIG key information' 
    });
  }

  let keyFilePath;
  try {
    keyFilePath = await generateTempKeyFile({
      keyName,
      keyValue,
      algorithm
    });

    // Execute dig with verbose output for debugging
    const command = `dig +time=10 +tries=1 @${server} ${zoneName} AXFR -k "${keyFilePath}" +multiline`;
    console.log('Executing dig command:', command.replace(keyValue, '[REDACTED]'));

    exec(command, { timeout: 15000 }, async (error, stdout, stderr) => {
      // Clean up key file immediately
      if (keyFilePath) {
        await cleanupTempFile(keyFilePath);
      }

      if (error) {
        console.error('Dig error:', error);
        console.error('Dig stderr:', stderr);
        return res.status(500).json({ 
          error: true, 
          message: 'Zone transfer failed',
          details: error.message,
          stderr 
        });
      }

      if (stderr) {
        console.warn('Dig stderr (warning):', stderr);
      }

      console.log('Dig stdout:', stdout);

      const records = parseDigOutput(stdout);
      console.log(`Parsed ${records.length} records from zone ${zoneName}`);
      res.json(records);
    });
  } catch (error) {
    console.error('AXFR error:', error);
    if (keyFilePath) {
      await cleanupTempFile(keyFilePath);
    }
    res.status(500).json({ 
      error: true, 
      message: 'Failed to fetch zone records',
      details: error.message 
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