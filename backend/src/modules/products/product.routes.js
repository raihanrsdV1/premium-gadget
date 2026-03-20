const { Router } = require('express');
const controller = require('./product.controller');
const { authenticate, authorize } = require('../auth/auth.middleware');

const router = Router();

// Public
router.get('/', controller.getAll);
router.get('/featured', controller.getFeatured);
router.get('/search', controller.search);
router.get('/:slug', controller.getBySlug);
router.get('/:id/variants', controller.getVariants);

// Admin
router.post('/', authenticate, authorize('super_admin', 'branch_admin'), controller.create);
router.put('/:id', authenticate, authorize('super_admin', 'branch_admin'), controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), controller.remove);

// Variants management
router.post('/:id/variants', authenticate, authorize('super_admin', 'branch_admin'), controller.createVariant);
router.put('/variants/:variantId', authenticate, authorize('super_admin', 'branch_admin'), controller.updateVariant);
router.delete('/variants/:variantId', authenticate, authorize('super_admin'), controller.removeVariant);

// Specifications
router.post('/:id/specifications', authenticate, authorize('super_admin', 'branch_admin'), controller.addSpecification);

// Key features
router.post('/:id/key-features', authenticate, authorize('super_admin', 'branch_admin'), controller.addKeyFeature);

// Images
router.post('/:id/images', authenticate, authorize('super_admin', 'branch_admin'), controller.addImage);

module.exports = router;
