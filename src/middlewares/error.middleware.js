import { AppError } from '../utils/errors.js';

export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Unexpected/unhandled error — log full detail server-side, but never
  // leak internals  to the client.
  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
  });
};
