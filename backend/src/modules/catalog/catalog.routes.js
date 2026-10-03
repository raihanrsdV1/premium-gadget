const { Router } = require('express');
const controller = require('./catalog.controller');
const { validate } = require('../../middleware/validate');
const { suggestQuery } = require('./catalog.validation');

// Public: /search/suggest and /catalog/menu (mounted in app.js).
const searchRouter = Router();
searchRouter.get('/suggest', validate(suggestQuery, 'query'), controller.suggest);

const catalogRouter = Router();
catalogRouter.get('/menu', controller.getMenu);

module.exports = { searchRouter, catalogRouter };
