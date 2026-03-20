const config = require('./index');

const sslcommerzConfig = {
  store_id: config.sslcommerz.storeId,
  store_passwd: config.sslcommerz.storePassword,
  is_live: !config.sslcommerz.isSandbox,
};

module.exports = sslcommerzConfig;
