const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const { parseDigOutput, parseSOARecord } = require('../helpers/parseHelpers');
const { generateTempKeyFile, cleanupTempFile } = require('../helpers/fileHelpers');

const execPromise = util.promisify(exec);
const router = express.Router();

// Get zone information
router.get('/:zone', async (req, res) => {
    const { zone } = req.params;
    const { server, key } = req.query;

    try {
        let command = `dig @${server} ${zone} axfr`;
        let keyFilePath;

        if (key) {
            const keyConfig = JSON.parse(key);
            keyFilePath = await generateTempKeyFile(keyConfig);
            command += ` -k ${keyFilePath}`;
        }

        const { stdout, stderr } = await execPromise(command);
        
        if (keyFilePath) {
            await cleanupTempFile(keyFilePath);
        }

        if (stderr) {
            console.error('dig stderr:', stderr);
        }

        const records = parseDigOutput(stdout);
        res.json({ records });

    } catch (error) {
        console.error('Error in zone transfer:', error);
        res.status(500).json({ 
            error: 'Failed to perform zone transfer',
            details: error.message 
        });
    }
});

// Get SOA record
router.get('/:zone/soa', async (req, res) => {
    const { zone } = req.params;
    const { server } = req.query;

    try {
        const { stdout, stderr } = await execPromise(
            `dig @${server} ${zone} SOA +multiline`
        );

        if (stderr) {
            console.error('dig stderr:', stderr);
        }

        const lines = stdout.split('\n')
            .filter(line => line.includes('SOA') && !line.includes(';'));
        
        if (lines.length === 0) {
            return res.status(404).json({ error: 'SOA record not found' });
        }

        const soaRecord = parseSOARecord(lines);
        res.json(soaRecord);

    } catch (error) {
        console.error('Error fetching SOA:', error);
        res.status(500).json({ 
            error: 'Failed to fetch SOA record',
            details: error.message 
        });
    }
});

module.exports = router; 