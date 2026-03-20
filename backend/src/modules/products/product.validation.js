const { z } = require('zod');

const createProductSchema = z.object({
  name: z.string().min(2).max(255),
  short_description: z.string().max(500).optional(),
  description_md: z.string().optional(),
  category_id: z.string().uuid(),
  brand_id: z.string().uuid().optional(),
  condition: z.enum(['new', 'used']).default('new'),
  condition_notes: z.string().optional(),
  is_featured: z.boolean().default(false),
  meta_title: z.string().max(255).optional(),
  meta_description: z.string().optional(),
});

const createVariantSchema = z.object({
  sku: z.string().min(1).max(60),
  variant_name: z.string().min(1).max(255),
  color: z.string().max(60).optional(),
  price: z.number().positive(),
  compare_at_price: z.number().positive().optional(),
  attributes: z.array(z.object({
    attribute_key: z.string().min(1).max(80),
    attribute_value: z.string().min(1).max(120),
  })).optional(),
});

const addSpecificationSchema = z.object({
  spec_key: z.string().min(1).max(120),
  spec_value: z.string().min(1),
});

const addKeyFeatureSchema = z.object({
  feature: z.string().min(1).max(255),
});

module.exports = {
  createProductSchema,
  createVariantSchema,
  addSpecificationSchema,
  addKeyFeatureSchema,
};
