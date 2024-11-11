const { spawn } = require('child_process');
const waitOn = require('wait-on');

const startServer = () => {
  const port = process.env.PORT || '3001';
  const opts = {
    resources: [`tcp:${port}`],
    delay: 1000,
    interval: 100,
    timeout: 30000,
  };

  console.log(`Starting development server on port ${port}...`);
  const server = spawn('react-scripts', ['start'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      HOST: '0.0.0.0',
      PORT: port,
      BROWSER: 'none',
      WATCHPACK_POLLING: 'true',
      WDS_SOCKET_PORT: port,
    },
  });

  // Handle server process errors
  server.on('error', (err) => {
    console.error('Failed to start development server:', err);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Development server exited with code ${code}`);
      process.exit(code);
    }
  });

  waitOn(opts)
    .then(() => {
      console.log(`Development server is ready at http://localhost:${port}`);
    })
    .catch((err) => {
      console.error('Error starting development server:', err);
      server.kill();
      process.exit(1);
    });

  return server;
};

startServer(); 