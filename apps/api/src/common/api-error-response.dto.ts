import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { ApiErrorResponse } from '@xiaoqiu/contracts'

import { API_ERROR_CODES } from './api-error-codes'

export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({
    type: String,
    enum: Object.values(API_ERROR_CODES),
    example: API_ERROR_CODES.VALIDATION_FAILED,
  })
  code!: ApiErrorResponse['code']

  @ApiProperty({ type: String, example: '请求参数校验失败' })
  message!: string

  @ApiProperty({ type: String, example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  requestId!: string

  @ApiPropertyOptional({
    additionalProperties: true,
    type: 'object',
  })
  details?: Record<string, unknown>
}
