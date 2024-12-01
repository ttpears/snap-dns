const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const { requestLogger } = require('./src/middleware/logging');
const zoneRoutes = require('./src/routes/zoneRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '10mb' }));
app.use(express.raw({ type: 'application/dns-message', limit: '512b' }));
app.use(requestLogger);

// Routes
app.use('/api/zones', zoneRoutes);
app.use('/api/webhook', webhookRoutes);

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(config.port, config.host, () => {
    console.log(`Server running at http://${config.host}:${config.port}`);
}); 