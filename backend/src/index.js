const config = require('./config');
const app = require('./app');
const { pool } = require('./config/database');
const jobs = require('./jobs');

let server;
let shuttingDown = false;

const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection verified');
    if (config.isProd && config.sslcommerz.isSandbox) {
      console.warn('⚠️  SSLCommerz SANDBOX mode in production — payments are not real. Set SSLCOMMERZ_IS_SANDBOX=false before going live.');
    }

    server = app.listen(config.port, () => {
      console.log(`🚀 Premium Gadget API running on port ${config.port} [${config.env}]`);
    });
    if (config.jobs.enabled) jobs.start();
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

/**
 * Graceful shutdown: stop accepting connections, let in-flight requests
 * (including payment callbacks) finish, stop jobs, close the DB pool.
 */
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully`);
  jobs.stop();

  const forceExit = setTimeout(() => {
    console.error('⏱  Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
  forceExit.unref();

  const closeServer = server ? new Promise((resolve) => server.close(resolve)) : Promise.resolve();
  closeServer
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});

startServer();
