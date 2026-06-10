import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { Body, Controller, Module, Post, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { IsString, Length } from 'class-validator'
import request from 'supertest'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { configureApp } from './app.setup'
import { API_ERROR_CODES } from './common/api-error-codes'
import { PrismaService } from './database/prisma.service'

class ValidationProbeDto {
  @IsString()
  @Length(3, 20)
  name!: string
}

@Controller('test')
class ValidationProbeController {
  @Post('validation')
  validate(@Body() body: ValidationProbeDto): ValidationProbeDto {
    return body
  }
}

@Module({
  controllers: [AppController, ValidationProbeController],
  providers: [
    AppService,
    {
      provide: PrismaService,
      useValue: {
        $queryRawUnsafe: async () => [{ result: 1 }],
      },
    },
  ],
})
class TestAppModule {}

let app: INestApplication

before(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile()

  app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
})

after(async () => {
  await app.close()
})

test('GET /api/health returns database state and propagates requestId', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/health')
    .set('x-request-id', 'health-test-request')
    .expect(200)

  assert.equal(response.headers['x-request-id'], 'health-test-request')
  assert.equal(response.body.requestId, 'health-test-request')
  assert.equal(response.body.service, 'api')
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.database.status, 'ok')
  assert.equal(typeof response.body.database.latencyMs, 'number')
})

test('validation errors use the unified error response', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/test/validation')
    .send({ name: 'x', unexpected: true })
    .expect(400)

  assert.equal(response.body.code, API_ERROR_CODES.VALIDATION_FAILED)
  assert.equal(response.body.message, '请求参数校验失败')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
  assert.ok(Array.isArray(response.body.details.errors))
  assert.ok(response.body.details.errors.length >= 1)
})

test('framework errors use the unified error response', async () => {
  const response = await request(app.getHttpServer()).get('/api/not-found').expect(404)

  assert.equal(response.body.code, API_ERROR_CODES.NOT_FOUND)
  assert.equal(response.body.message, '资源不存在')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
})

test('OpenAPI JSON is available at the stable endpoint', async () => {
  const response = await request(app.getHttpServer()).get('/api/openapi.json').expect(200)

  assert.equal(response.body.info.title, '晓球 API')
  assert.ok(response.body.paths['/api/health'])
})
