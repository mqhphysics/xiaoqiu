import 'reflect-metadata'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import { HttpStatus } from '@nestjs/common'
import request from 'supertest'
import sharp from 'sharp'
import { configureApp } from '../app.setup'
import type { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { PrismaService } from '../database/prisma.service'
import { MediaController } from '../media/media.controller'
import { MediaService } from '../media/media.service'
import type { SocialService } from '../social/social.service'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'

test('HTTP publishes a large single photo, retries once, reads it back, and preserves text-only posts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xiaoqiu-post-images-'))
  const previous = process.env.POST_MEDIA_DIRECTORY
  process.env.POST_MEDIA_DIRECTORY = directory
  const org = '00000000-0000-4000-8000-000000000001'
  const userId = '00000000-0000-4000-8000-000000000002'
  const tournamentId = '00000000-0000-4000-8000-000000000003'
  const posts = new Map<string, Record<string, unknown>>()
  let auditCount = 0
  const tx = {
    post: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        const item = data[0]!
        const key = `${item.authorUserId}:${item.clientPostId}`
        if (posts.has(key)) return { count: 0 }
        posts.set(key, {
          ...item,
          id: `post-${posts.size + 1}`,
          publishedAt: new Date(),
          author: {
            id: userId,
            displayName: '照片验收账户',
            verificationLevel: 'STUDENT_VERIFIED',
            avatarUrl: null,
          },
          team: null,
          _count: { likes: 0, comments: 0 },
          likes: [],
        })
        return { count: 1 }
      },
      findUnique: async ({
        where,
      }: {
        where: { authorUserId_clientPostId: { authorUserId: string; clientPostId: string } }
      }) =>
        posts.get(
          `${where.authorUserId_clientPostId.authorUserId}:${where.authorUserId_clientPostId.clientPostId}`,
        ),
    },
    auditLog: {
      create: async () => {
        auditCount += 1
        return {}
      },
    },
  }
  const prisma = {
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
    tournament: { findFirst: async () => ({ id: tournamentId }) },
    post: {
      count: async ({ where }: { where: { imageUrl: string } }) =>
        [...posts.values()].filter((post) => post.imageUrl === where.imageUrl).length,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...posts.values()].find((post) =>
          Object.entries(where).every(([key, value]) => post[key] === value),
        ),
    },
  } as unknown as PrismaService
  const auth = {
    requireSession: async (authorization: string | undefined) => {
      if (authorization !== 'Bearer photo-test')
        throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
          code: 'AUTH.UNAUTHORIZED',
          message: '请先登录',
        })
      return { organizationId: org, userId, user: { roles: [] } }
    },
  } as unknown as AuthService
  const media = new MediaService(prisma, auth)
  const experience = new ExperienceService(prisma, auth, {} as SocialService, media)
  const module = await Test.createTestingModule({
    controllers: [ExperienceController, MediaController],
    providers: [
      { provide: ExperienceService, useValue: experience },
      { provide: MediaService, useValue: media },
    ],
  }).compile()
  const app = module.createNestApplication()
  configureApp(app)
  await app.init()
  try {
    const pixels = Buffer.alloc(512 * 320 * 3)
    let random = 123456789
    for (let i = 0; i < pixels.length; i += 1) {
      random ^= random << 13
      random ^= random >>> 17
      random ^= random << 5
      pixels[i] = random & 255
    }
    const bytes = await sharp(pixels, { raw: { width: 512, height: 320, channels: 3 } })
      .png()
      .toBuffer()
    const imageDataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    assert.ok(
      imageDataUrl.length > 100 * 1024,
      'request must exercise the larger image body parser',
    )
    const payload = { clientPostId: 'post-photo-test-1', body: '带图发布验收', imageDataUrl }
    await request(app.getHttpServer()).post('/api/community/posts').send(payload).expect(401)
    assert.equal(posts.size, 0)
    const first = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(payload)
      .expect(201)
    assert.equal(first.body.title, null)
    assert.match(
      first.body.imageUrl,
      new RegExp(`^/api/media/posts/${org}/${userId}/[a-f0-9]{64}\\.webp$`),
    )
    const retry = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(payload)
      .expect(201)
    assert.equal(retry.body.id, first.body.id)
    assert.equal(auditCount, 1)
    const photo = await request(app.getHttpServer()).get(first.body.imageUrl).expect(200)
    assert.equal(photo.headers['content-type'], 'image/webp')
    assert.equal((await sharp(photo.body).metadata()).width, 512)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ ...payload, imageDataUrl: undefined })
      .expect(409)
    const plain = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ clientPostId: 'post-text-test-2', body: '纯文字发布验收' })
      .expect(201)
    assert.equal(plain.body.imageUrl, null)
    assert.equal(auditCount, 2)
    posts.get(`${userId}:${payload.clientPostId}`)!.status = 'HIDDEN'
    await request(app.getHttpServer()).get(first.body.imageUrl).expect(404)
    await request(app.getHttpServer())
      .get(first.body.imageUrl.replace(userId, tournamentId))
      .expect(404)
  } finally {
    await app.close()
    if (previous === undefined) delete process.env.POST_MEDIA_DIRECTORY
    else process.env.POST_MEDIA_DIRECTORY = previous
    await rm(directory, { recursive: true, force: true })
  }
})
