import { AppError } from "../utils/errors.js"

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    // Unexpected/unhandled error — log full detail server-side, but never
    // leak internals (stack traces, Prisma error shapes, etc.) to the client.
    console.error(err);
    return res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again.",
    });
}
