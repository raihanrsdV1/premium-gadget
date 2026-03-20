const slugifyLib = require('slugify');

/**
 * Generate a URL-safe slug from a string.
 * @param {string} text
 * @returns {string}
 */
const slugify = (text) =>
  slugifyLib(text, { lower: true, strict: true, trim: true });

module.exports = slugify;
