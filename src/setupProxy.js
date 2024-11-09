const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/ws',
    createProxyMiddleware({
      target: process.env.REACT_APP_PUBLIC_URL || 'http://localhost:3001',
      ws: true,
      changeOrigin: true,
    })
  );
};
