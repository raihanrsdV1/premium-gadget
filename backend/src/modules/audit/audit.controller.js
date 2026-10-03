const asyncHandler = require('../../utils/asyncHandler');
const service = require('./audit.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, ...result });
});

const actions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.actions() });
});

module.exports = { list, actions };
