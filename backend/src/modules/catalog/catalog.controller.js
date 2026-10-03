const asyncHandler = require('../../utils/asyncHandler');
const service = require('./catalog.service');

const suggest = asyncHandler(async (req, res) => {
  const data = await service.suggest(req.validatedQuery.q);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data });
});

const getMenu = asyncHandler(async (req, res) => {
  const data = await service.getMenu();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ success: true, data });
});

module.exports = { suggest, getMenu };
