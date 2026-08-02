import { ZodError } from "zod";
import { ValidationError } from "../utils/errors.js";

/**
 * Takes a schema shaped like { body?, params?, query? } (each a Zod schema)
 * and validates the matching part of the request. On success, req.body /
 * req.params / req.query are replaced with the *parsed* values — so
 * defaults, coercions (e.g. "2" -> 2), and trims from the schema actually
 * take effect downstream in the controller/service.
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
            req.query = schema.query.parse(req.query);
        }
        next();
    } catch (err) {
        if (err instanceof ZodError) {
            const message = err.errors
                .map((e) => `${e.path.join(".") || "value"}: ${e.message}`)
                .join("; ");
            return next(new ValidationError(message));
        }
        next(err);
    }
}
