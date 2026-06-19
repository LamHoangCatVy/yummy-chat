import type { YummyError } from "./errors"

export interface ApiResponse<T> {
  readonly success: true
  readonly data: T
  readonly meta: {
    readonly timestamp: string
    readonly requestId: string
  }
}

export interface ApiErrorResponse {
  readonly success: false
  readonly error: YummyError
  readonly meta: {
    readonly timestamp: string
    readonly requestId: string
  }
}
