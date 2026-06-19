export interface ValidationError {
  readonly type: "VALIDATION_ERROR"
  readonly message: string
  readonly statusCode: 400
  readonly fields: ReadonlyArray<{
    readonly field: string
    readonly message: string
  }>
}

export interface AuthError {
  readonly type: "AUTH_ERROR"
  readonly message: string
  readonly statusCode: 401
}

export interface NotFoundError {
  readonly type: "NOT_FOUND_ERROR"
  readonly message: string
  readonly statusCode: 404
  readonly resource: string
}

export interface ForbiddenError {
  readonly type: "FORBIDDEN_ERROR"
  readonly message: string
  readonly statusCode: 403
}

export interface RateLimitError {
  readonly type: "RATE_LIMIT_ERROR"
  readonly message: string
  readonly statusCode: 429
  readonly retryAfter: number
}

export interface InternalError {
  readonly type: "INTERNAL_ERROR"
  readonly message: string
  readonly statusCode: 500
}

export interface UnsupportedMediaTypeError {
  readonly type: "UNSUPPORTED_MEDIA_TYPE_ERROR"
  readonly message: string
  readonly statusCode: 415
  readonly acceptedTypes: readonly string[]
}

export type YummyError =
  | ValidationError
  | AuthError
  | NotFoundError
  | ForbiddenError
  | RateLimitError
  | InternalError
  | UnsupportedMediaTypeError
