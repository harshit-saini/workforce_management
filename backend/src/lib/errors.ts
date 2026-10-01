export class AppError extends Error {
  statusCode: number;
  code: string;
  /** Extra, non-sensitive context the client can use (e.g. the organization an expired invite belongs to). */
  details?: Record<string, unknown>;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST", details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string) {
    return new AppError(message, 400, "BAD_REQUEST");
  }
  static unauthorized(message = "Unauthorized") {
    return new AppError(message, 401, "UNAUTHORIZED");
  }
  static forbidden(message = "Forbidden") {
    return new AppError(message, 403, "FORBIDDEN");
  }
  static notFound(message = "Not found") {
    return new AppError(message, 404, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new AppError(message, 409, "CONFLICT");
  }
}
