const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // WebSocket proxy for development
  app.use(
    '/ws',
    createProxyMiddleware({
      target: process.env.PUBLIC_URL || 'http://localhost:3001',
      ws: true,
      changeOrigin: true,
    })
  );

  // API proxy for development
  if (process.env.NODE_ENV === 'development') {
    app.use(
      '/api',
      createProxyMiddleware({
        target: process.env.REACT_APP_API_URL || 'http://localhost:3002',
        changeOrigin: true,
        pathRewrite: {
          '^/api': '', // Remove /api prefix when forwarding
        },
      })
    );
  }
};
