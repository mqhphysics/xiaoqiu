import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { ApiExceptionFilter } from './common/api-exception.filter'
import { requestIdMiddleware } from './common/request-id.middleware'
import { RequestLoggingInterceptor } from './common/request-logging.interceptor'
import { createValidationPipe } from './common/validation'

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api')
  app.use(requestIdMiddleware)
  app.useGlobalPipes(createValidationPipe())
  app.useGlobalFilters(new ApiExceptionFilter())
  app.useGlobalInterceptors(new RequestLoggingInterceptor())

  const swaggerConfig = new DocumentBuilder()
    .setTitle('晓球 API')
    .setDescription('晓球平台 REST API')
    .setVersion(process.env.APP_VERSION ?? '0.1.0')
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  })
}
