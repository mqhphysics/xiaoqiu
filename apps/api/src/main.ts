import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle('晓球 API')
    .setDescription('晓球平台 REST API')
    .setVersion(process.env.APP_VERSION ?? '0.1.0')
    .build()

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig))

  const port = Number(process.env.API_PORT ?? 3000)
  const host = process.env.API_HOST ?? '0.0.0.0'

  await app.listen(port, host)
}

void bootstrap()
