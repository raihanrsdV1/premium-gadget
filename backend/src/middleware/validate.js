/**
 * Zod validation middleware factory shared by all modules.
 *
 *   router.post('/', validate(createSchema), handler)            → req.validatedBody
 *   router.get('/', validate(listQuerySchema, 'query'), handler)  → req.validatedQuery
 *   router.get('/:id', validate(idParams, 'params'), handler)     → req.validatedParams
 *
 * Unknown keys are stripped (Zod's default), so mass-assignment of fields like
 * `role` or `price` is impossible unless a schema explicitly allows them.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
const TARGET = { body: 'validatedBody', query: 'validatedQuery', params: 'validatedParams' };

const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) return next(result.error);
  req[TARGET[source]] = result.data;
  next();
};

module.exports = { validate };
