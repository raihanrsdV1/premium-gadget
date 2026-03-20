const dotenv = require('dotenv');
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  db: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  sslcommerz: {
    storeId: process.env.SSLCOMMERZ_STORE_ID,
    storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD,
    isSandbox: process.env.SSLCOMMERZ_IS_SANDBOX === 'true',
    initUrl: process.env.SSLCOMMERZ_INIT_URL || 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
    validationUrl: process.env.SSLCOMMERZ_VALIDATION_URL || 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
  },

  sms: {
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID || 'PremiumGadget',
  },
};

module.exports = config;
