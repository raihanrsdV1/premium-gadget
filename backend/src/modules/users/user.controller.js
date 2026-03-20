const asyncHandler = require('../../utils/asyncHandler');
const userService = require('./user.service');

const getAll = asyncHandler(async (req, res) => {
  const users = await userService.getAll(req.query);
  res.json({ success: true, ...users });
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json({ success: true, data: user });
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  res.json({ success: true, data: user });
});

const remove = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  res.json({ success: true, message: 'User deleted' });
});

module.exports = { getAll, getById, update, remove };
