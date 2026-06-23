import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  configureApp(app)
  app.enableShutdownHooks()

  const port = Number(process.env.API_PORT ?? 3000)
  const host = process.env.API_HOST ?? '0.0.0.0'

  await app.listen(port, host)
}

void bootstrap()
