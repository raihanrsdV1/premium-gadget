const asyncHandler = require('../../utils/asyncHandler');
const service = require('./repair.service');

const getServices = asyncHandler(async (req, res) => {
  const result = await service.getServices();
  res.json({ success: true, data: result });
});

const trackRepair = asyncHandler(async (req, res) => {
  const result = await service.trackRepair(req.query);
  res.json({ success: true, data: result });
});

const createTicket = asyncHandler(async (req, res) => {
  const result = await service.createTicket(req.body);
  res.status(201).json({ success: true, data: result });
});

const getAllTickets = asyncHandler(async (req, res) => {
  const result = await service.getAllTickets(req.query, req.user);
  res.json({ success: true, ...result });
});

const getTicketById = asyncHandler(async (req, res) => {
  const result = await service.getTicketById(req.params.id);
  res.json({ success: true, data: result });
});

const updateTicket = asyncHandler(async (req, res) => {
  const result = await service.updateTicket(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const addRepairPayment = asyncHandler(async (req, res) => {
  const result = await service.addRepairPayment(req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

module.exports = { getServices, trackRepair, createTicket, getAllTickets, getTicketById, updateTicket, addRepairPayment };
