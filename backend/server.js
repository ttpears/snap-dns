const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const dnsPacket = require('dns-packet');
const { Buffer } = require('buffer');
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

const parseSOARecord = (lines) => {
  const soaText = lines.join(' ').trim();
  console.log('Raw SOA text:', soaText);

  // Extract the main parts (before parentheses)
  const [nameServer, adminEmail] = soaText.split(/\s+/).slice(0, 2);
  
  // Extract numbers between parentheses
  const numbers = soaText.match(/\(([^)]+)\)/);
  const [serial, refresh, retry, expire, minimum] = numbers ? 
    numbers[1].split(/[;\s]+/).filter(n => !isNaN(parseInt(n))) : [];

  const soaData = {
    mname: nameServer,
    rname: adminEmail,
    serial: parseInt(serial) || 0,
    refresh: parseInt(refresh) || 0,
    retry: parseInt(retry) || 0,
    expire: parseInt(expire) || 0,
    minimum: parseInt(minimum) || 0
  };

  console.log('Parsed SOA data:', soaData);
  return soaData;
};

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

                // Parse the dig output into structured records
                const records = [];
                const lines = stdout.split('\n');
                
                let currentRecord = null;
                let recordLines = [];

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    if (trimmedLine === '' || trimmedLine.includes('TSIG') || trimmedLine.includes('key "')) {
                        continue;
                    }

                    if (trimmedLine.startsWith(';')) {
                        continue;
                    }

                    if (line.startsWith(' ') || line.startsWith('\t')) {
                        recordLines.push(trimmedLine);
                    } else {
                        // Process previous record if exists
                        if (currentRecord) {
                            if (currentRecord.type === 'SOA') {
                                const soaData = parseSOARecord([currentRecord.initialValue, ...recordLines]);
                                records.push({
                                    ...currentRecord,
                                    value: soaData
                                });
                            } else {
                                records.push({
                                    ...currentRecord,
                                    value: recordLines.join(' ').trim() || currentRecord.initialValue
                                });
                            }
                        }

                        // Start new record
                        const match = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
                        if (match) {
                            const [, name, ttl, recordClass, type, value = ''] = match;
                            currentRecord = {
                                name,
                                ttl: parseInt(ttl),
                                class: recordClass,
                                type,
                                initialValue: value
                            };
                            recordLines = [];
                        }
                    }
                }

                // Process last record
                if (currentRecord) {
                    if (currentRecord.type === 'SOA') {
                        const soaData = parseSOARecord([currentRecord.initialValue, ...recordLines]);
                        records.push({
                            ...currentRecord,
                            value: soaData
                        });
                    } else {
                        records.push({
                            ...currentRecord,
                            value: recordLines.join(' ').trim() || currentRecord.initialValue
                        });
                    }
                }

                // Log the first SOA record for debugging
                const soaRecord = records.find(r => r.type === 'SOA');
                console.log('First SOA record:', soaRecord);

                const filteredRecords = records.filter(r => 
                    r.type !== 'TSIG' && r.type !== 'KEY'
                );

                res.json(filteredRecords);
            } catch (error) {
                console.error('Error processing zone transfer:', error);
                res.status(500).json({ 
                    error: true, 
                    message: 'Failed to process zone transfer',
                    details: error.message 
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

app.post('/zone/:zoneName/record', async (req, res) => {
    console.log('\n=== Add DNS Record Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    console.log('Request body:', {
        server: req.body.server,
        keyName: req.body.keyName,
        algorithm: req.body.algorithm,
        record: req.body.record
        // Don't log keyValue
    });
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm, record } = req.body;

    if (!server || !keyName || !keyValue || !algorithm || !record) {
        console.error('Missing required parameters');
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
        console.log('Created update file:', updateFile);
        console.log('Update content:', updateContent);

        const command = `nsupdate -k "${keyFilePath}" "${updateFile}"`;
        console.log('Executing command:', command);
        
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

app.post('/zone/:zoneName/record/delete', async (req, res) => {
    console.log('\n=== Delete DNS Record Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    console.log('Request body:', {
        server: req.body.server,
        keyName: req.body.keyName,
        algorithm: req.body.algorithm,
        record: req.body.record
    });
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm, record } = req.body;

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
update delete ${record.name} ${record.ttl} ${record.type} ${record.value}
send
`;

        await fs.writeFile(updateFile, updateContent, { mode: 0o600 });
        console.log('Created update file:', updateFile);

        const command = `nsupdate -k "${keyFilePath}" "${updateFile}"`;
        console.log('Executing command:', command);
        
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
                        message: 'Failed to delete DNS record',
                        details: error.message
                    });
                }

                res.json({ success: true, message: 'Record deleted successfully' });
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
        console.error('Record deletion error:', error);
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }
        res.status(500).json({ 
            error: true, 
            message: 'Failed to delete DNS record',
            details: error.message 
        });
    }
});

app.post('/zone/:zoneName/restore', async (req, res) => {
    console.log('\n=== Restore DNS Records Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    console.log('Request body:', {
        server: req.body.server,
        keyName: req.body.keyName,
        algorithm: req.body.algorithm,
        recordCount: req.body.records.length
    });
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm, records } = req.body;

    if (!server || !keyName || !keyValue || !algorithm || !records) {
        console.error('Missing required parameters');
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
        const updateFile = path.join(await ensureTempDir(), `restore-${Date.now()}.txt`);
        let updateContent = `server ${server}\nzone ${zoneName}\n`;
        
        // Add each record
        records.forEach(record => {
            updateContent += `update add ${record.name} ${record.ttl} ${record.type} ${record.value}\n`;
        });
        
        updateContent += 'send\n';

        await fs.writeFile(updateFile, updateContent, { mode: 0o600 });
        console.log('Created restore file:', updateFile);
        console.log('Update content:', updateContent);

        const command = `nsupdate -k "${keyFilePath}" "${updateFile}"`;
        console.log('Executing command:', command);
        
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
                        message: 'Failed to restore DNS records',
                        details: error.message
                    });
                }

                res.json({ 
                    success: true, 
                    message: `Successfully restored ${records.length} records` 
                });
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
        console.error('Record restore error:', error);
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }
        res.status(500).json({ 
            error: true, 
            message: 'Failed to restore DNS records',
            details: error.message 
        });
    }
});

app.put('/zone/:zoneName/record', async (req, res) => {
    console.log('\n=== Modify DNS Record Request ===');
    console.log('Time:', new Date().toISOString());
    console.log('Zone:', req.params.zoneName);
    console.log('Request body:', {
        server: req.body.server,
        keyName: req.body.keyName,
        algorithm: req.body.algorithm,
        originalRecord: req.body.originalRecord,
        newRecord: req.body.newRecord
    });
    
    const { zoneName } = req.params;
    const { server, keyName, keyValue, algorithm, originalRecord, newRecord } = req.body;

    if (!server || !keyName || !keyValue || !algorithm || !originalRecord || !newRecord) {
        console.error('Missing required parameters');
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
update delete ${originalRecord.name} ${originalRecord.ttl} ${originalRecord.type} ${originalRecord.value}
update add ${newRecord.name} ${newRecord.ttl} ${newRecord.type} ${newRecord.value}
send
`;

        await fs.writeFile(updateFile, updateContent, { mode: 0o600 });
        console.log('Created update file:', updateFile);
        console.log('Update content:', updateContent);

        const command = `nsupdate -k "${keyFilePath}" "${updateFile}"`;
        console.log('Executing command:', command);
        
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
                        message: 'Failed to modify DNS record',
                        details: error.message
                    });
                }

                res.json({ success: true, message: 'Record modified successfully' });
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
        console.error('Record modification error:', error);
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }
        res.status(500).json({ 
            error: true, 
            message: 'Failed to modify DNS record',
            details: error.message 
        });
    }
});

app.post('/webhook/mattermost', async (req, res) => {
    const { webhookUrl, payload } = req.body;
    
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ 
            error: true, 
            message: 'Failed to send webhook notification',
            details: error.message 
        });
    }
});

app.post('/zone/:zoneName/record/update', async (req, res) => {
  const { zoneName } = req.params;
  const { server, keyName, keyValue, algorithm, originalRecord, newRecord } = req.body;

  try {
    // Create a temporary key file
    const keyFilePath = await createTempKeyFile(keyName, keyValue, algorithm);

    // Prepare the nsupdate commands
    let updateCommands = '';

    // For SOA records, we need to delete the old one first
    if (newRecord.type === 'SOA') {
      updateCommands += `update delete ${originalRecord.name} ${originalRecord.type}\n`;
      updateCommands += `update add ${newRecord.name} ${newRecord.ttl} ${newRecord.type} ${newRecord.value}\n`;
    } else {
      // For other records, we can just replace them
      updateCommands += `update delete ${originalRecord.name} ${originalRecord.type} ${originalRecord.value}\n`;
      updateCommands += `update add ${newRecord.name} ${newRecord.ttl} ${newRecord.type} ${newRecord.value}\n`;
    }

    updateCommands += 'send\n';

    // Execute nsupdate
    const result = await executeNSUpdate(updateCommands, server, keyFilePath);

    // Clean up the temporary key file
    await cleanupTempFile(keyFilePath);

    res.json({ success: true, message: 'Record updated successfully' });
  } catch (error) {
    console.error('Failed to update record:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Failed to update record',
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