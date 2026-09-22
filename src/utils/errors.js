export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // marks "expected" errors vs. bugs/crashes
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input") {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict with existing resource") {
    super(message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code, details) {
    super(message, 401);
    this.code = code;
    this.details = details;
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to perform this action",
    code,
    details,
  ) {
    super(message, 403);
    this.code = code;
    this.details = details;
  }
}
