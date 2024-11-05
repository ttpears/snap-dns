const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Helper Functions
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

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Routes
app.post('/zone/:zoneName/axfr', async (req, res) => {
    console.log('\n=== Zone Transfer Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm } = req.body;

    if (!server || !keyName || !keyValue || !algorithm) {
        console.error('Missing required parameters');
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

        console.log('Generated key file:', keyFilePath);
        console.log('Executing dig command...');

        const command = `dig +time=10 +tries=1 @${server} ${zoneName} AXFR -k "${keyFilePath}" +multiline`;
        
        exec(command, { timeout: 15000 }, async (error, stdout, stderr) => {
            try {
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
                        details: error.message
                    });
                }

                if (stderr) {
                    console.warn('Dig stderr (warning):', stderr);
                }

                const records = parseDigOutput(stdout);
                console.log(`Parsed ${records.length} records from zone ${zoneName}`);
                res.json(records);
            } catch (cleanupError) {
                console.error('Error in cleanup:', cleanupError);
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

app.post('/zone/:zoneName/record', async (req, res) => {
    console.log('\n=== Add DNS Record Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm, record } = req.body;

    if (!server || !keyName || !keyValue || !algorithm || !record) {
        return res.status(400).json({ 
            error: true, 
            message: 'Missing required information' 
        });
    }

    let keyFilePath;
    try {
        keyFilePath = await generateTempKeyFile({
            keyName,
            keyValue,
            algorithm
        });

        // Create nsupdate command file
        const updateFile = path.join(await ensureTempDir(), `update-${Date.now()}.txt`);
        const updateContent = `server ${server}
zone ${zoneName}
update add ${record.name} ${record.ttl} ${record.type} ${record.value}
send
`;

        await fs.writeFile(updateFile, updateContent, { mode: 0o600 });

        const command = `nsupdate -k "${keyFilePath}" "${updateFile}"`;
        
        exec(command, { timeout: 10000 }, async (error, stdout, stderr) => {
            try {
                // Clean up files
                await Promise.all([
                    cleanupTempFile(keyFilePath),
                    cleanupTempFile(updateFile)
                ]);

                if (error) {
                    console.error('nsupdate error:', error);
                    console.error('nsupdate stderr:', stderr);
                    return res.status(500).json({ 
                        error: true, 
                        message: 'Failed to update DNS record',
                        details: error.message
                    });
                }

                res.json({ success: true, message: 'Record added successfully' });
            } catch (cleanupError) {
                console.error('Error in cleanup:', cleanupError);
                if (!res.headersSent) {
                    res.status(500).json({ 
                        error: true, 
                        message: 'Error cleaning up temporary files' 
                    });
                }
            }
        });
    } catch (error) {
        console.error('Record update error:', error);
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }
        res.status(500).json({ 
            error: true, 
            message: 'Failed to update DNS record',
            details: error.message 
        });
    }
});

// Start server
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
}); 