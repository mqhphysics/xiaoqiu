import { Inject, Injectable } from '@nestjs/common'
import { AdminCenterService } from './admin-center.service'
import { AdminMediaService } from './admin-media.service'
import { centerError } from './admin-center.policy'
import type { AdminContentDecisionDto, AdminCenterReasonDto } from './admin-center.dto'
import { postImageUrls } from '../media/media.service'

@Injectable()
export class AdminModerationService {
  constructor(
    @Inject(AdminCenterService) private readonly center: AdminCenterService,
    @Inject(AdminMediaService) private readonly media: AdminMediaService,
  ) {}
  capabilities(auth: string | undefined) {
    return this.center.read(auth, async () => {
      let publicMediaGuardReady = false
      try {
        const response = await fetch(
          (process.env.PUBLIC_API_BASE_URL || 'http://127.0.0.1:3001') + '/api/media/guard-status',
          { signal: AbortSignal.timeout(2500) },
        )
        if (response.ok) {
          const status = (await response.json()) as { guardVersion?: number }
          publicMediaGuardReady = status.guardVersion === 1
        }
      } catch {
        /* A missing public gate must remain explicitly unverified. */
      }
      return {
        publicMediaGuardReady,
        aiConfigured: Boolean(process.env.ADMIN_AI_MODERATION_URL),
        aiMode: 'ADVISORY',
        description: '人工审核可用；AI通过显式配置的HTTP审核服务接入，不会自动封禁账号。',
      }
    })
  }
  decision(
    auth: string | undefined,
    id: string,
    body: AdminContentDecisionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      `POST /admin/center/posts/${id}/decisions`,
      body,
      key,
      async (tx, actor) => {
        const current = await tx.post.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!current) throw centerError(404, '本组织不存在该帖子')
        const status = body.action === 'BLOCK' ? 'HIDDEN' : 'PUBLISHED'
        const updated = await tx.post.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            updatedAt: new Date(body.expectedUpdatedAt),
          },
          data: { status },
        })
        if (updated.count !== 1) throw centerError(409, '帖子已被修改，请刷新核对')
        await this.center.auditWrite(
          tx,
          actor,
          body.action === 'BLOCK'
            ? 'POST_BLOCKED'
            : body.action === 'APPROVE'
              ? 'POST_APPROVED'
              : 'POST_RESTORED',
          'Post',
          id,
          body.reason,
          requestId,
          { status: current.status },
          { status },
        )
        return {
          id,
          status,
          updatedAt: (
            await tx.post.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })
          ).updatedAt.toISOString(),
        }
      },
    )
  }
  async ai(
    auth: string | undefined,
    type: 'POST' | 'MEDIA',
    idOrUrl: string,
    reason: AdminCenterReasonDto,
  ) {
    await this.center.read(auth, async () => true)
    if (!process.env.ADMIN_AI_MODERATION_URL)
      throw centerError(409, 'AI审核服务尚未配置。人工审核和封禁可正常使用。')
    const input = await this.center.read(auth, async (tx, actor) => {
      if (type === 'POST') {
        const post = await tx.post.findFirst({
          where: { id: idOrUrl, organizationId: actor.organizationId },
          select: { id: true, title: true, body: true, imageUrl: true, updatedAt: true },
        })
        if (!post) throw centerError(404, '帖子不在当前组织')
        return {
          type,
          id: post.id,
          title: post.title,
          text: post.body,
          images: postImageUrls(post.imageUrl),
          version: post.updatedAt.toISOString(),
        }
      }
      return {
        type,
        id: idOrUrl,
        text: '',
        images: [idOrUrl],
        version: null,
      }
    })
    const images = await Promise.all(
      input.images.map(async (url) => {
        const preview = await this.media.preview(auth, url)
        return `data:${preview.mimeType};base64,${preview.body.toString('base64')}`
      }),
    )
    let result: unknown
    try {
      const response = await fetch(process.env.ADMIN_AI_MODERATION_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.ADMIN_AI_MODERATION_KEY
            ? { authorization: `Bearer ${process.env.ADMIN_AI_MODERATION_KEY}` }
            : {}),
        },
        body: JSON.stringify({ protocol: 'xiaoqiu-moderation-v1', ...input, images }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error('AI服务返回失败')
      result = await response.json()
    } catch {
      throw centerError(503, 'AI审核请求失败或超时，本次未自动执行封禁')
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('decision' in result) ||
      !['ALLOW', 'REVIEW', 'BLOCK'].includes(String(result.decision)) ||
      !('summary' in result) ||
      typeof result.summary !== 'string' ||
      !result.summary.trim() ||
      result.summary.length > 2000
    )
      throw centerError(503, 'AI审核响应不符合协议，本次不执行处理')
    const safe = {
      decision: String(result.decision),
      summary: result.summary,
      reviewedAt: new Date().toISOString(),
      automaticAction: false,
    }
    await this.center.read(auth, async (tx, actor) =>
      this.center.auditWrite(
        tx,
        actor,
        'AI_MODERATION_REVIEWED',
        type === 'POST' ? 'Post' : 'MediaURL',
        type === 'POST' ? idOrUrl : 'image-review',
        reason.reason,
        'ai-review',
        null,
        { decision: safe.decision, count: 1 },
      ),
    )
    return safe
  }
}
