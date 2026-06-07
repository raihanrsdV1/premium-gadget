const { Router } = require('express');
const controller = require('./wishlist.controller');
const { addToWishlistSchema, validate } = require('./wishlist.validation');
const { authenticate } = require('../auth/auth.middleware');

const router = Router();

// All wishlist routes are scoped to the authenticated user.
router.get('/', authenticate, controller.getMine);
router.post('/', authenticate, validate(addToWishlistSchema), controller.add);
router.delete('/:productId', authenticate, controller.remove);

module.exports = router;
