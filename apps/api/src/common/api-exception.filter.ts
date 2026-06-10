import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { ApiErrorResponse, ErrorCode } from '@xiaoqiu/contracts'
import type { Response } from 'express'

import { API_ERROR_CODES } from './api-error-codes'
import type { ApiHttpExceptionBody } from './api-http.exception'
import { getRequestId, type RequestWithId } from './request-context'

const STATUS_ERROR_CODES: Readonly<Partial<Record<number, ErrorCode>>> = {
  [HttpStatus.BAD_REQUEST]: API_ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: API_ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: API_ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: API_ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: API_ERROR_CODES.CONFLICT,
  [HttpStatus.SERVICE_UNAVAILABLE]: API_ERROR_CODES.SERVICE_UNAVAILABLE,
}

const STATUS_MESSAGES: Readonly<Partial<Record<number, string>>> = {
  [HttpStatus.BAD_REQUEST]: '请求无效',
  [HttpStatus.UNAUTHORIZED]: '需要登录',
  [HttpStatus.FORBIDDEN]: '无权执行此操作',
  [HttpStatus.NOT_FOUND]: '资源不存在',
  [HttpStatus.CONFLICT]: '请求与当前资源状态冲突',
  [HttpStatus.SERVICE_UNAVAILABLE]: '服务暂时不可用',
}

function isApiHttpExceptionBody(value: unknown): value is ApiHttpExceptionBody {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ApiHttpExceptionBody>
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<RequestWithId>()
    const response = http.getResponse<Response>()
    const requestId = getRequestId(request)
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined

    let code = STATUS_ERROR_CODES[status] ?? API_ERROR_CODES.INTERNAL_ERROR
    let message = STATUS_MESSAGES[status] ?? '服务器内部错误'
    let details: Record<string, unknown> | undefined

    if (isApiHttpExceptionBody(exceptionResponse)) {
      code = exceptionResponse.code
      message = exceptionResponse.message
      details = exceptionResponse.details
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify({
          error: exception instanceof Error ? exception.message : 'unknown error',
          method: request.method,
          path: request.originalUrl,
          requestId,
          status,
        }),
        exception instanceof Error ? exception.stack : undefined,
      )
    }

    const body: ApiErrorResponse = {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    }

    response.status(status).json(body)
  }
}
