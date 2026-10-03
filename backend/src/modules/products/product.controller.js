const asyncHandler = require('../../utils/asyncHandler');
const service = require('./product.service');

// ─── Public ──────────────────────────────────────────

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getFeatured = asyncHandler(async (req, res) => {
  const data = await service.getFeatured(req.validatedQuery);
  res.json({ success: true, data });
});

const search = asyncHandler(async (req, res) => {
  const result = await service.search(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getSitemap = asyncHandler(async (req, res) => {
  const data = await service.getSitemap();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ success: true, data });
});

const getBySlug = asyncHandler(async (req, res) => {
  const data = await service.getBySlug(req.validatedParams.slug);
  res.json({ success: true, data });
});

const getVariants = asyncHandler(async (req, res) => {
  const data = await service.getVariants(req.validatedParams.id);
  res.json({ success: true, data });
});

// ─── Staff ───────────────────────────────────────────

const getAdminList = asyncHandler(async (req, res) => {
  const result = await service.getAdminList(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getAdminById = asyncHandler(async (req, res) => {
  const data = await service.getAdminById(req.validatedParams.id);
  res.json({ success: true, data });
});

const getPriceHistory = asyncHandler(async (req, res) => {
  const data = await service.getPriceHistory(req.validatedParams.id);
  res.json({ success: true, data });
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Product deleted' });
});

const createVariant = asyncHandler(async (req, res) => {
  const data = await service.createVariant(req.validatedParams.id, req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const updateVariant = asyncHandler(async (req, res) => {
  const data = await service.updateVariant(req.validatedParams.variantId, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const removeVariant = asyncHandler(async (req, res) => {
  const data = await service.removeVariant(req.validatedParams.variantId, req.user);
  res.json({
    success: true,
    message: data.deleted ? 'Variant deleted' : 'Variant is in use and was deactivated instead',
    data,
  });
});

const addSpecification = asyncHandler(async (req, res) => {
  const data = await service.addSpecification(req.validatedParams.id, req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const replaceSpecifications = asyncHandler(async (req, res) => {
  const data = await service.replaceSpecifications(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const removeSpecification = asyncHandler(async (req, res) => {
  await service.removeSpecification(req.validatedParams.id, req.validatedParams.specId, req.user);
  res.json({ success: true, message: 'Specification deleted' });
});

const addKeyFeature = asyncHandler(async (req, res) => {
  const data = await service.addKeyFeature(req.validatedParams.id, req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const replaceKeyFeatures = asyncHandler(async (req, res) => {
  const data = await service.replaceKeyFeatures(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const removeKeyFeature = asyncHandler(async (req, res) => {
  await service.removeKeyFeature(req.validatedParams.id, req.validatedParams.featureId, req.user);
  res.json({ success: true, message: 'Key feature deleted' });
});

const addImage = asyncHandler(async (req, res) => {
  const data = await service.addImage(req.validatedParams.id, req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const reorderImages = asyncHandler(async (req, res) => {
  const data = await service.reorderImages(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const updateImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.validatedParams;
  const data = await service.updateImage(id, imageId, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const removeImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.validatedParams;
  const data = await service.removeImage(id, imageId, req.user);
  res.json({ success: true, message: 'Image removed', data });
});

module.exports = {
  getAll, getFeatured, search, getSitemap, getBySlug, getVariants,
  getAdminList, getAdminById, getPriceHistory,
  create, update, remove,
  createVariant, updateVariant, removeVariant,
  addSpecification, replaceSpecifications, removeSpecification,
  addKeyFeature, replaceKeyFeatures, removeKeyFeature,
  addImage, reorderImages, updateImage, removeImage,
};
