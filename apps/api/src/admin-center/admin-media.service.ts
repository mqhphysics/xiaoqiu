import { Inject, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { AdminCenterService } from './admin-center.service'
import { centerError } from './admin-center.policy'
import type { AdminCenterPageDto, AdminMediaDecisionDto } from './admin-center.dto'
import { Prisma } from '../generated/prisma/client'
import { mediaPath, mediaKey, mediaPolicies } from '../media/media-access-policy'
import { postImageUrls } from '../media/media.service'

type Ref = {
  kind: string
  ownerId: string
  ownerName: string
  url: string
  updatedAt: Date
  visibility: string
  field: string
}
@Injectable()
export class AdminMediaService {
  constructor(@Inject(AdminCenterService) private readonly center: AdminCenterService) {}
  async references(tx: Prisma.TransactionClient, org: string): Promise<Ref[]> {
    const [users, players, teams, posts] = await Promise.all([
      tx.user.findMany({
        where: { memberships: { some: { organizationId: org } } },
        select: { id: true, displayName: true, avatarUrl: true, updatedAt: true },
      }),
      tx.playerProfile.findMany({
        where: { organizationId: org },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          portraitUrl: true,
          updatedAt: true,
        },
      }),
      tx.team.findMany({
        where: { organizationId: org },
        select: { id: true, name: true, crestUrl: true, updatedAt: true },
      }),
      tx.post.findMany({
        where: { organizationId: org },
        select: { id: true, title: true, imageUrl: true, updatedAt: true, status: true },
      }),
    ])
    return [
      ...users
        .filter((u) => u.avatarUrl)
        .map((u) => ({
          kind: 'USER_AVATAR',
          ownerId: u.id,
          ownerName: u.displayName,
          url: u.avatarUrl!,
          updatedAt: u.updatedAt,
          visibility: 'PUBLIC',
          field: 'avatarUrl',
        })),
      ...players.flatMap((p) =>
        ['avatarUrl', 'portraitUrl'].flatMap((field) => {
          const url = field === 'avatarUrl' ? p.avatarUrl : p.portraitUrl
          return url
            ? [
                {
                  kind: field === 'avatarUrl' ? 'PLAYER_AVATAR' : 'PLAYER_PORTRAIT',
                  ownerId: p.id,
                  ownerName: p.displayName,
                  url,
                  updatedAt: p.updatedAt,
                  visibility: 'PUBLIC',
                  field,
                },
              ]
            : []
        }),
      ),
      ...teams
        .filter((t) => t.crestUrl)
        .map((t) => ({
          kind: 'TEAM_CREST',
          ownerId: t.id,
          ownerName: t.name,
          url: t.crestUrl!,
          updatedAt: t.updatedAt,
          visibility: 'PUBLIC',
          field: 'crestUrl',
        })),
      ...posts
        .filter((p) => p.imageUrl)
        .flatMap((p) =>
          postImageUrls(p.imageUrl).map((url) => ({
            kind: 'POST_IMAGE',
            ownerId: p.id,
            ownerName: p.title || '动态图片',
            url,
            updatedAt: p.updatedAt,
            visibility: p.status === 'PUBLISHED' ? 'PUBLIC' : 'HIDDEN',
            field: 'imageUrl',
          })),
        ),
    ]
  }
  list(auth: string | undefined, q: AdminCenterPageDto) {
    return this.center.read(auth, async (tx, actor) => {
      const refs = await this.references(tx, actor.organizationId)
      const records = await tx.auditLog.findMany({
        where: {
          organizationId: actor.organizationId,
          targetType: 'MediaURL',
          action: { in: ['MEDIA_BLOCKED', 'MEDIA_RESTORED'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { targetId: true, afterSummary: true },
      })
      const policies = new Map<string, Record<string, unknown>>()
      for (const row of records) {
        const s = row.afterSummary as Record<string, unknown>
        const previous = policies.get(row.targetId)
        if (!previous || Number(s.policyVersion) > Number(previous.policyVersion))
          policies.set(row.targetId, s)
      }
      const items = new Map<string, Record<string, unknown>>()
      for (const ref of refs) {
        let key: string
        try {
          key = mediaKey(ref.url)
        } catch {
          continue
        }
        const p = policies.get(key)
        if (!items.has(key))
          items.set(key, {
            id: key,
            kind: ref.kind,
            ownerId: ref.ownerId,
            ownerName: ref.ownerName,
            url: ref.url,
            visibility: p?.blocked ? 'BLOCKED' : ref.visibility,
            updatedAt: ref.updatedAt.toISOString(),
            policyVersion: Number(p?.policyVersion ?? 0),
            referenceCount: 0,
          })
        items.get(key)!.referenceCount = Number(items.get(key)!.referenceCount) + 1
      }
      for (const [key, p] of policies)
        if (p.blocked && !items.has(key))
          items.set(key, {
            id: key,
            kind: p.kind,
            ownerId: p.ownerId,
            ownerName: p.ownerName || '已下架图片',
            url: p.url,
            visibility: 'BLOCKED',
            updatedAt: p.handledAt,
            policyVersion: Number(p.policyVersion),
            referenceCount: 0,
          })
      const rows = [...items.values()]
        .filter((r) =>
          `${r.ownerName} ${r.kind}`.toLowerCase().includes((q.query ?? '').toLowerCase()),
        )
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      return {
        items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
        total: rows.length,
        page: q.page,
        pageSize: q.pageSize,
      }
    })
  }
  decision(
    auth: string | undefined,
    input: AdminMediaDecisionDto,
    key: string | undefined,
    requestId: string,
  ) {
    let canonical: string
    try {
      canonical = mediaPath(input.url)
    } catch {
      throw centerError(400, '只支持本站存储的图片，外链需取消引用或联系来源站点')
    }
    const id = mediaKey(canonical)
    return this.center.write(
      auth,
      `POST /admin/center/media/${id}/decisions`,
      input,
      key,
      async (tx, actor) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${actor.organizationId + ':media:' + id}))::text AS locked`,
        )
        const previous = (await mediaPolicies(tx, canonical, actor.organizationId))[0]?.state as
          | Record<string, unknown>
          | undefined
        const version = Number(previous?.policyVersion ?? 0)
        if (version !== input.expectedVersion)
          throw centerError(409, '图片处理状态已变化，请刷新后核对')
        if (previous && Boolean(previous.blocked) === (input.action === 'BLOCK'))
          return {
            id,
            blocked: Boolean(previous.blocked),
            policyVersion: version,
            referenceCount: 0,
            alreadyHandled: true,
          }
        const refs = (await this.references(tx, actor.organizationId)).filter((r) => {
          try {
            return mediaPath(r.url) === canonical
          } catch {
            return false
          }
        })
        if (!refs.length && !previous) throw centerError(404, '本组织中没有该图片引用')
        const ownership = refs[0] ?? previous!
        const beforeRefs = previous?.references as Ref[] | undefined
        const changes = input.action === 'BLOCK' ? refs : (beforeRefs ?? [])
        const isPlatform = actor.user.roles.some(
          (r) => r.role === 'PLATFORM_ADMIN' && r.scopeType === 'PLATFORM',
        )
        if (!isPlatform) {
          const foreign = await tx.$queryRaw<Array<{ count: bigint }>>(
            Prisma.sql`SELECT count(*) AS count FROM (SELECT avatar_url AS url FROM player_profiles WHERE organization_id<>${actor.organizationId}::uuid UNION ALL SELECT portrait_url FROM player_profiles WHERE organization_id<>${actor.organizationId}::uuid UNION ALL SELECT crest_url FROM teams WHERE organization_id<>${actor.organizationId}::uuid UNION ALL SELECT image_url FROM posts WHERE organization_id<>${actor.organizationId}::uuid UNION ALL SELECT u.avatar_url FROM app_users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.organization_id<>${actor.organizationId}::uuid) shared WHERE url=${input.url} OR url LIKE ${'%' + canonical}`,
          )
          if (Number(foreign[0]?.count))
            throw centerError(409, '该文件有跨组织引用，需平台管理员处理，不能影响其他组织')
        }
        for (const ref of changes) {
          const restored = input.action === 'RESTORE' ? ref.url : null
          if (ref.kind === 'USER_AVATAR')
            await tx.user.updateMany({
              where: {
                id: ref.ownerId,
                avatarUrl: input.action === 'BLOCK' ? ref.url : null,
                memberships: { some: { organizationId: actor.organizationId } },
              },
              data: { avatarUrl: restored },
            })
          else if (ref.kind === 'TEAM_CREST')
            await tx.team.updateMany({
              where: {
                id: ref.ownerId,
                organizationId: actor.organizationId,
                crestUrl: input.action === 'BLOCK' ? ref.url : null,
              },
              data: { crestUrl: restored },
            })
          else if (ref.kind === 'PLAYER_AVATAR' || ref.kind === 'PLAYER_PORTRAIT')
            await tx.playerProfile.updateMany({
              where: {
                id: ref.ownerId,
                organizationId: actor.organizationId,
                [ref.field]: input.action === 'BLOCK' ? ref.url : null,
              },
              data: { [ref.field]: restored },
            })
          else if (ref.kind === 'POST_IMAGE') {
            const image = await tx.post.findFirst({
              where: { id: ref.ownerId, organizationId: actor.organizationId },
              select: { imageUrl: true },
            })
            if (
              input.action === 'BLOCK' &&
              image?.imageUrl &&
              postImageUrls(image.imageUrl).includes(ref.url)
            )
              await tx.post.updateMany({
                where: {
                  id: ref.ownerId,
                  organizationId: actor.organizationId,
                  imageUrl: image.imageUrl,
                },
                data: { imageUrl: null },
              })
            else if (input.action === 'RESTORE' && !image?.imageUrl)
              await tx.post.updateMany({
                where: { id: ref.ownerId, organizationId: actor.organizationId, imageUrl: null },
                data: {
                  imageUrl: ref.url.replace(/-[2-9]-[1-8]\.webp$/, (match) =>
                    match.replace(/-[1-8]\.webp$/, '-0.webp'),
                  ),
                },
              })
          }
        }
        const state = {
          blocked: input.action === 'BLOCK',
          policyVersion: version + 1,
          url: canonical,
          kind: ownership.kind,
          ownerId: ownership.ownerId,
          ownerName: ownership.ownerName,
          references: input.action === 'BLOCK' ? refs : (beforeRefs ?? []),
          handledAt: new Date().toISOString(),
        }
        await this.center.auditWrite(
          tx,
          actor,
          input.action === 'BLOCK' ? 'MEDIA_BLOCKED' : 'MEDIA_RESTORED',
          'MediaURL',
          id,
          input.reason,
          requestId,
          { policyVersion: version, blocked: previous?.blocked ?? false },
          state,
        )
        return {
          id,
          blocked: state.blocked,
          policyVersion: state.policyVersion,
          referenceCount: changes.length,
          publicReferencesRemoved: input.action === 'BLOCK',
          cacheBoundary:
            '服务端拒绝新的读取；已下载的文件或旧浏览器缓存无法远程撤回。旧公开API需加载媒体门禁版本才能拦截原地址。',
        }
      },
    )
  }
  preview(auth: string | undefined, url: string) {
    return this.center.read(auth, async (tx, actor) => {
      let canonical: string
      try {
        if (typeof url !== 'string') throw new Error('Missing URL')
        canonical = mediaPath(url)
      } catch {
        throw centerError(400, '请提供本站图片地址')
      }
      const refs = (await this.references(tx, actor.organizationId)).filter((r) => {
        try {
          return mediaPath(r.url) === canonical
        } catch {
          return false
        }
      })
      const state = (await mediaPolicies(tx, canonical, actor.organizationId))[0]?.state
      if (!refs.length && !state) throw centerError(404, '本组织中不存在该媒体')
      await this.center.auditWrite(
        tx,
        actor,
        'MEDIA_PREVIEWED',
        'MediaURL',
        mediaKey(canonical),
        '管理员查看图片',
        'admin-media-preview',
        null,
        { count: 1 },
      )
      return this.bytes(canonical)
    })
  }
  async bytes(url: string) {
    const canonical = mediaPath(url)
    const repository = resolve(__dirname, '../../../..')
    const legacy = process.env.ADMIN_LEGACY_REPOSITORY || repository
    const roots = [repository, legacy]
    for (const root of roots) {
      let base: string
      let tail: string
      if (canonical.startsWith('/api/media/demo/')) {
        base = resolve(root, 'apps/api/demo-media')
        tail = canonical.slice('/api/media/demo/'.length)
      } else if (canonical.startsWith('/api/media/avatars/')) {
        base = resolve(root, 'private-data/media/avatars')
        tail = canonical.slice('/api/media/avatars/'.length)
      } else {
        base =
          root === repository
            ? process.env.POST_MEDIA_DIRECTORY || resolve(root, 'private-data/media/posts')
            : resolve(root, 'private-data/media/posts')
        tail = canonical.slice('/api/media/posts/'.length)
      }
      const target = resolve(base, tail)
      if (!target.startsWith(resolve(base) + sep)) throw centerError(400, '图片路径无效')
      try {
        const body = await readFile(target)
        return {
          body,
          mimeType: canonical.endsWith('.webp')
            ? 'image/webp'
            : canonical.endsWith('.png')
              ? 'image/png'
              : 'image/jpeg',
        }
      } catch {
        /* Try trusted storage root. */
      }
    }
    throw centerError(404, '图片文件不存在或当前存储未挂载')
  }
}
