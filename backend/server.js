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
    console.log('=== Generating Key File ===');
    console.log('Key Name:', keyConfig.keyName);
    console.log('Algorithm:', keyConfig.algorithm);
    // Don't log the actual key value
    
    const tempDir = await ensureTempDir();
    console.log('Temp directory:', tempDir);
    
    const keyFileName = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.conf`;
    const keyFilePath = path.join(tempDir, keyFileName);
    console.log('Key file path:', keyFilePath);

    const keyFileContent = `key "${keyConfig.keyName}" {
    algorithm ${keyConfig.algorithm};
    secret "${keyConfig.keyValue}";
};`;

    try {
        // Log masked content (for security)
        console.log('Writing key file content:', keyFileContent.replace(keyConfig.keyValue, 'REDACTED'));
        
        await fs.writeFile(keyFilePath, keyFileContent, { mode: 0o600 });
        console.log('Key file created successfully');
        
        // Verify file exists and is readable
        const stats = await fs.stat(keyFilePath);
        console.log('File stats:', {
            size: stats.size,
            mode: stats.mode.toString(8),
            uid: stats.uid,
            gid: stats.gid
        });
        
        // Verify content (masked)
        const content = await fs.readFile(keyFilePath, 'utf8');
        console.log('Verified file content:', content.replace(keyConfig.keyValue, 'REDACTED'));
        
        return keyFilePath;
    } catch (error) {
        console.error('Error in generateTempKeyFile:', error);
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
    console.log('Request body received:', {
        server: req.body.server,
        keyName: req.body.keyName,
        algorithm: req.body.algorithm,
        // Don't log keyValue
    });

    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm } = req.body;

    let keyFilePath;
    try {
        // Test DNS server reachability first
        const testCommand = `dig @${server} +time=2 +tries=1`;
        console.log('Testing DNS server reachability:', testCommand);
        
        exec(testCommand, (testError, testStdout, testStderr) => {
            console.log('DNS server test results:', {
                error: testError?.message,
                stdout: testStdout,
                stderr: testStderr
            });
        });

        keyFilePath = await generateTempKeyFile({
            keyName,
            keyValue,
            algorithm
        });

        const command = `dig +time=10 +tries=1 @${server} ${zoneName} AXFR -k "${keyFilePath}" +multiline`;
        console.log('Executing dig command:', command);

        exec(command, { timeout: 15000 }, async (error, stdout, stderr) => {
            try {
                // Always clean up the key file first
                if (keyFilePath) {
                    await cleanupTempFile(keyFilePath);
                }

                if (error) {
                    console.error('Dig command failed:', {
                        error: error.message,
                        stdout: stdout,
                        stderr: stderr,
                        code: error.code
                    });
                    
                    return res.status(500).json({ 
                        error: true, 
                        message: 'Zone transfer failed',
                        details: {
                            error: error.message,
                            stdout: stdout,
                            stderr: stderr,
                            code: error.code
                        }
                    });
                }

                if (stderr) {
                    console.warn('Dig warnings:', stderr);
                }

                console.log('Dig command succeeded');
                console.log('Raw output:', stdout);

                const records = parseDigOutput(stdout);
                console.log(`Parsed ${records.length} records`);
                
                res.json(records);
            } catch (err) {
                console.error('Error processing dig output:', err);
                res.status(500).json({ 
                    error: true, 
                    message: 'Error processing zone transfer results',
                    details: err.message
                });
            }
        });
    } catch (error) {
        console.error('AXFR setup error:', error);
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }
        res.status(500).json({ 
            error: true, 
            message: 'Failed to setup zone transfer',
            details: error.stack
        });
    }
});

// Start server
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
}); 