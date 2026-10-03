const { z } = require('../../utils/validators');

// Arrays (?q=a&q=b) fail z.string() and give 400.
const suggestQuery = z.object({ q: z.string().trim().min(2).max(80) });

module.exports = { suggestQuery };
