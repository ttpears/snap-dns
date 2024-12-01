const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

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
    
    const tempDir = await ensureTempDir();
    const keyFileName = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.conf`;
    const keyFilePath = path.join(tempDir, keyFileName);

    const keyFileContent = `key "${keyConfig.keyName}" {
    algorithm ${keyConfig.algorithm};
    secret "${keyConfig.keyValue}";
};`;

    try {
        await fs.writeFile(keyFilePath, keyFileContent, { mode: 0o600 });
        return keyFilePath;
    } catch (error) {
        console.error('Error in generateTempKeyFile:', error);
        throw error;
    }
}

async function cleanupTempFile(filePath) {
    try {
        await fs.unlink(filePath);
        console.log('Cleaned up file:', filePath);
    } catch (error) {
        console.error('Error cleaning up temp file:', error);
    }
}

module.exports = {
    ensureTempDir,
    generateTempKeyFile,
    cleanupTempFile
}; 