import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'

import { ApiExceptionFilter } from './common/api-exception.filter'
import { requestIdMiddleware } from './common/request-id.middleware'
import { RequestLoggingInterceptor } from './common/request-logging.interceptor'
import { createValidationPipe } from './common/validation'

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api')
  const httpApp = app as NestExpressApplication
  httpApp.useBodyParser('json', { limit: '6mb' })
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.headers.authorization ||
      /^\/api\/(?:auth|me|admin|captain|messages|reports)(?:\/|$)/.test(request.path)
    ) {
      response.setHeader('Cache-Control', 'private, no-store')
      response.vary('Authorization')
      // Private API consumers expect fresh JSON rather than a cached 304 body.
      delete request.headers['if-none-match']
      delete request.headers['if-modified-since']
    }
    next()
  })
  app.enableCors({
    origin: resolveCorsOrigins(),
    allowedHeaders: [
      'authorization',
      'content-type',
      'idempotency-key',
      'x-dev-organization-id',
      'x-dev-role',
      'x-dev-user-id',
      'x-request-id',
      'x-request-source',
    ],
  })
  app.use(requestIdMiddleware)
  app.useGlobalPipes(createValidationPipe())
  app.useGlobalFilters(new ApiExceptionFilter())
  app.useGlobalInterceptors(new RequestLoggingInterceptor())

  const swaggerConfig = new DocumentBuilder()
    .setTitle('晓球 API')
    .setDescription('晓球平台 REST API')
    .setVersion(process.env.APP_VERSION ?? '0.1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  })
}

function resolveCorsOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (configuredOrigins?.length) {
    return configuredOrigins
  }

  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:10086',
    'http://127.0.0.1:10086',
    'http://localhost:10087',
    'http://127.0.0.1:10087',
  ]
}
