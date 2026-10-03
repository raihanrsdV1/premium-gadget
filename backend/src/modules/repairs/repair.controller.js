const asyncHandler = require('../../utils/asyncHandler');
const service = require('./repair.service');

const getServices = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getServices() });
});

const listServicesAdmin = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listServicesAdmin() });
});

const createService = asyncHandler(async (req, res) => {
  const result = await service.createService(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const updateService = asyncHandler(async (req, res) => {
  const result = await service.updateService(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const removeService = asyncHandler(async (req, res) => {
  const result = await service.removeService(req.validatedParams.id, req.user);
  res.json({
    success: true,
    data: result,
    message: result.deleted ? 'Service deleted' : 'Service is used by tickets — deactivated instead',
  });
});

const trackRepair = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.trackRepair(req.validatedQuery) });
});

const createTicket = asyncHandler(async (req, res) => {
  const result = await service.createTicket(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const createWalkIn = asyncHandler(async (req, res) => {
  const result = await service.createWalkIn(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const getAllTickets = asyncHandler(async (req, res) => {
  const result = await service.getAllTickets(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const getTicketById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getTicketById(req.validatedParams.id, req.user) });
});

const updateTicket = asyncHandler(async (req, res) => {
  const result = await service.updateTicket(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const addRepairPayment = asyncHandler(async (req, res) => {
  const result = await service.addRepairPayment(req.validatedParams.id, req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

module.exports = {
  getServices,
  listServicesAdmin,
  createService,
  updateService,
  removeService,
  trackRepair,
  createTicket,
  createWalkIn,
  getAllTickets,
  getTicketById,
  updateTicket,
  addRepairPayment,
};
