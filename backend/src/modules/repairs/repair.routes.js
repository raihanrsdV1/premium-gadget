const { Router } = require('express');
const controller = require('./repair.controller');
const { authenticate, optionalAuth, authorize, requireStaff } = require('../auth/auth.middleware');
const { formLimiter, lookupLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./repair.validation');

const router = Router();
const staff = [authenticate, requireStaff];
const superAdmin = [authenticate, authorize('super_admin')];

// ─── Service price list ──────────────────────────────────────
router.get('/services', controller.getServices); // public
router.get('/services/admin', ...staff, controller.listServicesAdmin);
router.post('/services', ...superAdmin, validate(v.createServiceSchema), controller.createService);
router.put('/services/:id', ...superAdmin, validate(idParams, 'params'), validate(v.updateServiceSchema), controller.updateService);
router.delete('/services/:id', ...superAdmin, validate(idParams, 'params'), controller.removeService);

// ─── Public ──────────────────────────────────────────────────
// Track by ticket number + phone (rate-limited: ticket numbers are guessable).
router.get('/track', lookupLimiter, validate(v.trackRepairSchema, 'query'), controller.trackRepair);
// Book a repair from the storefront; linked to the account when logged in.
router.post('/tickets', formLimiter, optionalAuth, validate(v.createTicketSchema), controller.createTicket);

// ─── Staff (branch scoped in the service) ────────────────────
router.post('/tickets/walk-in', ...staff, validate(v.walkInTicketSchema), controller.createWalkIn);
router.get('/tickets', ...staff, validate(v.listTicketsQuerySchema, 'query'), controller.getAllTickets);
router.get('/tickets/:id', ...staff, validate(idParams, 'params'), controller.getTicketById);
router.put('/tickets/:id', ...staff, validate(idParams, 'params'), validate(v.updateTicketSchema), controller.updateTicket);
router.post('/tickets/:id/payments', ...staff, validate(idParams, 'params'), validate(v.paymentSchema), controller.addRepairPayment);

module.exports = router;
