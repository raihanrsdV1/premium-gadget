const asyncHandler = require('../../utils/asyncHandler');
const service = require('./product.service');

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  res.json({ success: true, ...result });
});

const getFeatured = asyncHandler(async (req, res) => {
  const result = await service.getFeatured();
  res.json({ success: true, data: result });
});

const search = asyncHandler(async (req, res) => {
  const result = await service.search(req.query);
  res.json({ success: true, ...result });
});

const getBySlug = asyncHandler(async (req, res) => {
  const result = await service.getBySlug(req.params.slug);
  res.json({ success: true, data: result });
});

const getVariants = asyncHandler(async (req, res) => {
  const result = await service.getVariants(req.params.id);
  res.json({ success: true, data: result });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  res.status(201).json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: 'Product deleted' });
});

const createVariant = asyncHandler(async (req, res) => {
  const result = await service.createVariant(req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

const updateVariant = asyncHandler(async (req, res) => {
  const result = await service.updateVariant(req.params.variantId, req.body);
  res.json({ success: true, data: result });
});

const removeVariant = asyncHandler(async (req, res) => {
  await service.removeVariant(req.params.variantId);
  res.json({ success: true, message: 'Variant deleted' });
});

const addSpecification = asyncHandler(async (req, res) => {
  const result = await service.addSpecification(req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

const addKeyFeature = asyncHandler(async (req, res) => {
  const result = await service.addKeyFeature(req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

const addImage = asyncHandler(async (req, res) => {
  const result = await service.addImage(req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

module.exports = {
  getAll, getFeatured, search, getBySlug, getVariants,
  create, update, remove,
  createVariant, updateVariant, removeVariant,
  addSpecification, addKeyFeature, addImage,
};
