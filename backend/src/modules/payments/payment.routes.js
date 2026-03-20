const { Router } = require('express');
const controller = require('./payment.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = Router();

// Customer initiates payment
router.post('/initiate', authenticate, controller.initiatePayment);

// SSL Commerz IPN webhook (no auth — verified by store credentials)
router.post('/ipn', controller.handleIPN);

// SSL Commerz redirect URLs
router.post('/success', controller.handleSuccess);
router.post('/fail', controller.handleFail);
router.post('/cancel', controller.handleCancel);

// Validate a transaction
router.get('/validate/:transactionId', authenticate, controller.validateTransaction);

module.exports = router;
