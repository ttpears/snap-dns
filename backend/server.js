const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add an OPTIONS handler for preflight requests
app.options('*', cors());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Query params:', req.query);
  next();
});

app.use(express.json());

async function ensureTempDir() {
  const tempDir = process.env.TEMP_DIR || '/tmp/snap-dns';
  try {
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    return tempDir;
  } catch (error) {
    console.error('Error creating temp directory:', error);
    throw error;
  }
}

async function generateTempKeyFile(keyConfig) {
  const tempDir = await ensureTempDir();
  const keyFileName = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.conf`;
  const keyFilePath = path.join(tempDir, keyFileName);

  const keyFileContent = `key "${keyConfig.keyName}" {
    algorithm ${keyConfig.algorithm};
    secret "${keyConfig.keyValue}";
};`;

  try {
    // Write file with restricted permissions
    await fs.writeFile(keyFilePath, keyFileContent, { mode: 0o600 });
    console.log('Key file created:', keyFilePath);
    return keyFilePath;
  } catch (error) {
    console.error('Error creating key file:', error);
    throw error;
  }
}

async function cleanupTempFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log('Cleaned up key file:', filePath);
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
}

app.get('/zone/:zoneName/axfr', async (req, res) => {
  const { zoneName } = req.params;
  const { server, keyName, keyValue, algorithm } = req.query;

  console.log('Zone transfer request received:', {
    zoneName,
    server,
    keyName,
    algorithm,
    hasKeyValue: !!keyValue
  });

  if (!server || !keyName || !keyValue || !algorithm) {
    return res.status(400).json({ 
      error: true, 
      message: 'Missing required TSIG key information' 
    });
  }

  let keyFilePath;
  try {
    // Generate temporary key file
    keyFilePath = await generateTempKeyFile({
      keyName,
      keyValue,
      algorithm
    });

    // Execute dig with TSIG key
    const command = `dig @${server} ${zoneName} AXFR -k "${keyFilePath}"`;
    console.log('Executing command:', command.replace(keyValue, '[REDACTED]'));

    exec(command, async (error, stdout, stderr) => {
      try {
        // Clean up key file immediately after dig execution
        if (keyFilePath) {
          await cleanupTempFile(keyFilePath);
        }

        if (error) {
          console.error('Dig error:', error);
          return res.status(500).json({ 
            error: true, 
            message: 'Zone transfer failed',
            details: error.message 
          });
        }

        if (stderr) {
          console.warn('Dig stderr:', stderr);
        }

        const records = parseDigOutput(stdout);
        res.json(records);
      } catch (cleanupError) {
        console.error('Error in cleanup:', cleanupError);
        // Still try to send response even if cleanup fails
        if (!res.headersSent) {
          res.status(500).json({ 
            error: true, 
            message: 'Error cleaning up temporary files' 
          });
        }
      }
    });
  } catch (error) {
    console.error('AXFR error:', error);
    // Clean up on error
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

function parseDigOutput(output) {
  const records = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (!line.trim() || line.startsWith(';')) {
      continue;
    }

    try {
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      records.push({
        name: parts[0],
        ttl: parseInt(parts[1], 10),
        class: parts[2],
        type: parts[3],
        value: parts.slice(4).join(' ')
      });
    } catch (error) {
      console.error('Error parsing line:', line, error);
    }
  }
  
  return records;
}

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Access URLs:');
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://${HOST}:${PORT}`);
}); 