import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  type?: string;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log the error
  logger.error("Error occurred", {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Default error values
  let statusCode = error.statusCode || 500;
  let type = error.type || "internal_server_error";
  let code = error.code || "unknown_error";
  let message = error.message || "An unexpected error occurred";

  // Handle specific error types
  if (error.name === "ValidationError") {
    statusCode = 400;
    type = "invalid_request_error";
    code = "validation_error";
  } else if (error.name === "UnauthorizedError") {
    statusCode = 401;
    type = "authentication_error";
    code = "invalid_api_key";
  } else if (error.name === "QueryFailedError") {
    statusCode = 400;
    type = "invalid_request_error";
    code = "database_error";
  }

  // Don't leak internal error details in production
  if (process.env.NODE_ENV === "production" && statusCode >= 500) {
    message = "Internal server error";
  }

  // Send OpenAI-compatible error response
  res.status(statusCode).json({
    error: {
      message,
      type,
      code,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    },
  });
};
