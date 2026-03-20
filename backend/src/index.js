const config = require('./config');
const app = require('./app');
const { pool } = require('./config/database');

const startServer = async () => {
  try {
    // Verify database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection verified');

    app.listen(config.port, () => {
      console.log(`🚀 Premium Gadget API running on port ${config.port} [${config.env}]`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

startServer();
