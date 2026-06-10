import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common'

import { API_ERROR_CODES } from './api-error-codes'
import { ApiHttpException } from './api-http.exception'

function flattenValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  return errors.flatMap((error) => {
    const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`)
    return [...ownErrors, ...flattenValidationErrors(error.children ?? [], path)]
  })
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: (errors) =>
      new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: API_ERROR_CODES.VALIDATION_FAILED,
        message: '请求参数校验失败',
        details: {
          errors: flattenValidationErrors(errors),
        },
      }),
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
  })
}
