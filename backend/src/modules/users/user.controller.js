const asyncHandler = require('../../utils/asyncHandler');
const userService = require('./user.service');

const getAll = asyncHandler(async (req, res) => {
  const users = await userService.getAll(req.validatedQuery);
  res.json({ success: true, ...users });
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.validatedParams.id, req.user);
  res.json({ success: true, data: user });
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: user });
});

const remove = asyncHandler(async (req, res) => {
  await userService.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'User deleted' });
});

const createStaff = asyncHandler(async (req, res) => {
  const user = await userService.createStaff(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: user });
});

const changeRole = asyncHandler(async (req, res) => {
  const user = await userService.changeRole(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: user });
});

const changeStatus = asyncHandler(async (req, res) => {
  const user = await userService.changeStatus(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: user });
});

const resetPassword = asyncHandler(async (req, res) => {
  await userService.resetPassword(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, message: 'Password reset; the user has been signed out everywhere' });
});

module.exports = { getAll, getById, update, remove, createStaff, changeRole, changeStatus, resetPassword };
