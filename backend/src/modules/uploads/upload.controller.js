const asyncHandler = require('../../utils/asyncHandler');
const service = require('./upload.service');

const uploadImages = asyncHandler(async (req, res) => {
  const data = await service.uploadImages(req.files, req.user);
  res.status(201).json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Image deleted' });
});

module.exports = { uploadImages, remove };
