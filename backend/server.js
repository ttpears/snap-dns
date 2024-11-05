const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

async function generateTempKeyFile(keyConfig) {
  const tempDir = process.env.TEMP_DIR || '/tmp';
  const keyFileName = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.conf`;
  const keyFilePath = path.join(tempDir, keyFileName);

  const keyFileContent = `key "${keyConfig.keyName}" {
    algorithm ${keyConfig.algorithm};
    secret "${keyConfig.keyValue}";
};`;

  await fs.writeFile(keyFilePath, keyFileContent);
  return keyFilePath;
}

async function cleanupTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
}

app.get('/zone/:zoneName/axfr', async (req, res) => {
  const { zoneName } = req.params;
  const { server, keyName, keyValue, algorithm } = req.query;

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
    const command = `dig @${server} ${zoneName} AXFR -k ${keyFilePath}`;
    console.log('Executing command:', command.replace(keyValue, '[REDACTED]'));

    exec(command, (error, stdout, stderr) => {
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
    });
  } catch (error) {
    console.error('AXFR error:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Failed to fetch zone records',
      details: error.message 
    });
  } finally {
    if (keyFilePath) {
      await cleanupTempFile(keyFilePath);
    }
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('DNS Server:', process.env.DNS_SERVER || 'not configured');
}); 