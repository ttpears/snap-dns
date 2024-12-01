require('dotenv').config();

module.exports = {
    port: process.env.BACKEND_PORT || 3002,
    host: process.env.BACKEND_HOST || '0.0.0.0',
    tempDir: process.env.TEMP_DIR || '/tmp/snap-dns'
}; 