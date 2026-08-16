import { ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Takes a schema shaped like { body?, params?, query? } (each a Zod schema)
 * and validates the matching part of the request. On success, req.body /
 * req.params / req.query are replaced with the *parsed* values — so
 * defaults, coercions (e.g. "2" -> 2), and trims from the schema actually
 * take effect downstream in the controller/service.
 *
 * NOTE on req.query: Express 5 made `req.query` a getter-only property
 * (no setter) — `req.query = parsed` throws "Cannot set property query of
 * #<IncomingMessage> which has only a getter". This was an intentional
 * Express 5 change to close a prototype-pollution vector in query parsing.
 * The fix is to mutate the existing query object in place via
 * Object.assign rather than reassigning req.query itself — Express caches
 * the same object reference across the request lifecycle, so downstream
 * `req.query` reads in the controller still see the mutated, validated
 * values. req.params and req.body are unaffected by this Express 5 change
 * and can still be reassigned directly.
 *
 * Usage: validate({ body: someZodObject })
 *        validate({ params: idParamSchema, query: paginationSchema })
 */
export const validate = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body);
    }
    if (schema.params) {
      req.params = schema.params.parse(req.params);
    }
    if (schema.query) {
      const parsed = schema.query.parse(req.query);
      Object.assign(req.query, parsed);
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues
        .map((e) => `${e.path.join('.') || 'value'}: ${e.message}`)
        .join('; ');
      return next(new ValidationError(message));
    }
    next(err);
  }
};
