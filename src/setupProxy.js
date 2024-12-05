const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // WebSocket proxy for development
  app.use(
    '/ws',
    createProxyMiddleware({
      target: process.env.REACT_APP_WS_URL || 'ws://localhost:3002',
      ws: true,
      changeOrigin: true,
      secure: process.env.NODE_ENV === 'production'
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
          '^/api': '',
        },
      })
    );
  }
};
