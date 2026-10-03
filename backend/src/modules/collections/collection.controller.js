const asyncHandler = require('../../utils/asyncHandler');
const service = require('./collection.service');

const getPublicList = asyncHandler(async (req, res) => {
  const { home } = req.validatedQuery;
  const data = home ? await service.getHome() : await service.getLive();
  // Collections are merchandised (and revalidated on write); a short cache is enough.
  if (home) res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data });
});

const getPublicOne = asyncHandler(async (req, res) => {
  const { collection, products, pagination } = await service.getPublicBySlug(
    req.validatedParams.slug,
    req.validatedQuery
  );
  res.json({ success: true, data: { collection, products }, collection, products, pagination });
});

const getAdminList = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getAdminList() });
});

const getAdminById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getAdminById(req.validatedParams.id) });
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.create(req.validatedBody, req.user) });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.validatedParams.id, req.validatedBody, req.user) });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Collection deleted' });
});

const setProducts = asyncHandler(async (req, res) => {
  const data = await service.setProducts(req.validatedParams.id, req.validatedBody.product_ids, req.user);
  res.json({ success: true, data });
});

const setHomeOrder = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.setHomeOrder(req.validatedBody.ids, req.user) });
});

const setForProduct = asyncHandler(async (req, res) => {
  const data = await service.setForProduct(req.validatedParams.id, req.validatedBody.collection_ids, req.user);
  res.json({ success: true, data });
});

module.exports = {
  getPublicList, getPublicOne, getAdminList, getAdminById, create, update, remove,
  setProducts, setHomeOrder, setForProduct,
};
