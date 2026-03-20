const { Router } = require('express');
const controller = require('./repair.controller');
const { authenticate, authorize } = require('../auth/auth.middleware');

const router = Router();

// Public — browse repair services
router.get('/services', controller.getServices);

// Public — track repair by ticket number + phone
router.get('/track', controller.trackRepair);

// Customer — create repair ticket
router.post('/tickets', controller.createTicket);

// Admin — manage tickets
router.get('/tickets', authenticate, authorize('super_admin', 'branch_admin'), controller.getAllTickets);
router.get('/tickets/:id', authenticate, authorize('super_admin', 'branch_admin'), controller.getTicketById);
router.put('/tickets/:id', authenticate, authorize('super_admin', 'branch_admin'), controller.updateTicket);
router.post('/tickets/:id/payment', authenticate, authorize('super_admin', 'branch_admin'), controller.addRepairPayment);

module.exports = router;
