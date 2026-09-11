export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
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
