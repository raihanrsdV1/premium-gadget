/**
 * Shared fixtures for the Phase 2 tests (spec templates, banners, SEO).
 * Not a test file (no .test.js suffix).
 */
const { query } = require('../helpers');

/** A small but complete laptop template (4 highlights). */
const LAPTOP_TEMPLATE = {
  groups: [
    {
      name: 'Processor',
      fields: [
        { key: 'processor', label: 'Processor', type: 'text', highlight: true, filterable: true },
        { key: 'cpu_generation', label: 'Generation', type: 'select', options: ['8th Gen', '11th Gen', 'Apple M1'] },
      ],
    },
    {
      name: 'Display',
      fields: [
        { key: 'display_size', label: 'Display size', type: 'text', highlight: true },
        { key: 'touchscreen', label: 'Touchscreen', type: 'boolean' },
      ],
    },
    {
      name: 'Memory & Storage',
      fields: [
        { key: 'ram', label: 'RAM', type: 'text', unit: null, highlight: true, filterable: true },
        { key: 'storage', label: 'Storage', type: 'text', highlight: true },
      ],
    },
    { name: 'Physical', fields: [{ key: 'weight', label: 'Weight', type: 'number', unit: 'kg' }] },
  ],
};

/** Store a template directly (bypassing the API). */
const setTemplate = (categoryId, template) =>
  query('UPDATE categories SET spec_template = $2 WHERE id = $1', [categoryId, template ? JSON.stringify(template) : null]);

/** Spec rows of a product, in order. */
const specRows = async (productId) =>
  (await query(
    `SELECT spec_key, spec_value, group_name, field_key, is_highlight, sort_order
       FROM product_specifications WHERE product_id = $1 ORDER BY sort_order, id`,
    [productId]
  )).rows;

module.exports = { LAPTOP_TEMPLATE, setTemplate, specRows };
