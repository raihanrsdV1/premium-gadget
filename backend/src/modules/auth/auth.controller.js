const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validatedBody);
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validatedBody);
  res.json({ success: true, data: result });
});

const sendOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendOtp(req.validatedBody);
  res.json({ success: true, data: result });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtp(req.validatedBody);
  res.json({ success: true, data: result });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.validatedBody);
  res.json({ success: true, data: result });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.validatedBody);
  res.json({ success: true, data: result });
});

const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAll(req.user.id);
  res.json({ success: true, data: result });
});

const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.json({ success: true, data: user });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.validatedBody);
  res.json({ success: true, data: user });
});

module.exports = {
  register,
  login,
  sendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
  logoutAll,
  getProfile,
  updateProfile,
};
