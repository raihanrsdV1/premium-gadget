const { Router } = require('express');
const controller = require('./product.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./product.validation');
const collectionController = require('../collections/collection.controller');
const collectionValidation = require('../collections/collection.validation');

const router = Router();

const staff = [authenticate, requireStaff];
const superAdmin = [authenticate, authorize('super_admin')];
const params = (schema) => validate(schema, 'params');
const id = params(idParams);

// ─── Public ──────────────────────────────────────────
router.get('/', validate(v.listQuerySchema, 'query'), controller.getAll);
router.get('/featured', validate(v.featuredQuerySchema, 'query'), controller.getFeatured);
router.get('/search', validate(v.searchQuerySchema, 'query'), controller.search);
router.get('/sitemap', controller.getSitemap);

// ─── Staff reads (before /:slug so "admin" isn't read as a slug) ──
router.get('/admin', ...staff, validate(v.adminListQuerySchema, 'query'), controller.getAdminList);
router.get('/admin/:id', ...staff, id, controller.getAdminById);
router.get('/admin/:id/price-history', ...staff, id, controller.getPriceHistory);

router.get('/:slug', params(v.slugParams), controller.getBySlug);
router.get('/:id/variants', id, controller.getVariants);

// ─── Products ────────────────────────────────────────
router.post('/', ...staff, validate(v.createProductSchema), controller.create);
router.put('/:id', ...staff, id, validate(v.updateProductSchema), controller.update);
router.delete('/:id', ...superAdmin, id, controller.remove);
router.put(
  '/:id/collections', ...superAdmin, id,
  validate(collectionValidation.productCollectionsSchema), collectionController.setForProduct
);

// ─── Variants ────────────────────────────────────────
router.post('/:id/variants', ...staff, id, validate(v.createVariantSchema), controller.createVariant);
router.put('/variants/:variantId', ...staff, params(v.variantParams), validate(v.updateVariantSchema), controller.updateVariant);
router.delete('/variants/:variantId', ...superAdmin, params(v.variantParams), controller.removeVariant);

// ─── Specifications ──────────────────────────────────
// Spec / feature / image removals are content edits (PUT can replace the
// whole list anyway), so they're open to staff, not just super_admin.
router.post('/:id/specifications', ...staff, id, validate(v.addSpecificationSchema), controller.addSpecification);
router.put('/:id/specifications', ...staff, id, validate(v.replaceSpecificationsSchema), controller.replaceSpecifications);
router.delete('/:id/specifications/:specId', ...staff, params(v.specParams), controller.removeSpecification);

// ─── Key features ────────────────────────────────────
router.post('/:id/key-features', ...staff, id, validate(v.addKeyFeatureSchema), controller.addKeyFeature);
router.put('/:id/key-features', ...staff, id, validate(v.replaceKeyFeaturesSchema), controller.replaceKeyFeatures);
router.delete('/:id/key-features/:featureId', ...staff, params(v.featureParams), controller.removeKeyFeature);

// ─── Images ──────────────────────────────────────────
router.post('/:id/images', ...staff, id, validate(v.addImageSchema), controller.addImage);
router.put('/:id/images/order', ...staff, id, validate(v.reorderImagesSchema), controller.reorderImages);
router.patch('/:id/images/:imageId', ...staff, params(v.imageParams), validate(v.updateImageSchema), controller.updateImage);
router.delete('/:id/images/:imageId', ...staff, params(v.imageParams), controller.removeImage);

module.exports = router;
