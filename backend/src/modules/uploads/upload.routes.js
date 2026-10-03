const { Router } = require('express');
const multer = require('multer');
const controller = require('./upload.controller');
const { authenticate, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');

const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Memory storage: nothing touches disk until the bytes have been decoded and
// re-encoded (see upload.service). The declared MIME type is ignored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 10, fieldSize: 1024, parts: MAX_FILES + 10 },
});

const router = Router();

// Auth runs before multer so anonymous / customer uploads are never buffered.
router.post('/images', authenticate, requireStaff, upload.array('images', MAX_FILES), controller.uploadImages);
router.delete('/:id', authenticate, requireStaff, validate(idParams, 'params'), controller.remove);

module.exports = router;
