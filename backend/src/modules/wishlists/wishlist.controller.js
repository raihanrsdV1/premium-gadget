const asyncHandler = require('../../utils/asyncHandler');
const service = require('./wishlist.service');

const getMine = asyncHandler(async (req, res) => {
  const result = await service.getMine(req.user);
  res.json({ success: true, data: result });
});

const add = asyncHandler(async (req, res) => {
  const result = await service.add(req.user, req.validatedBody.product_id);
  res.status(201).json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.productId);
  res.json({ success: true, message: 'Removed from wishlist' });
});

module.exports = { getMine, add, remove };
