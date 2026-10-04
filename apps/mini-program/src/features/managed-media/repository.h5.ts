import { readSession } from '../product/session'
import { resolveMediaUrl } from '../product/product.repository'

export type MediaPurpose = 'GOAL_GIF' | 'USER_AVATAR' | 'USER_BACKGROUND' | 'PLAYER_PORTRAIT'
export interface MediaAsset {
  id: string
  purpose: MediaPurpose
  targetId: string
  targetLabel: string
  matchId: string | null
  contentUrl: string
  posterUrl: string
  bytes: number
  durationMs: number
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  visibility?: 'ACTIVE' | 'HIDDEN' | 'DELETED'
  version?: number
  reviewReason?: string | null
  canRestore?: boolean
  associationState?: 'CURRENT' | 'REMOVED_OR_CHANGED'
  createdAt: string
}
export interface MediaCapabilities {
  enabled: boolean
  canSubmit: boolean
  canReview: boolean
  canDirectPublish: boolean
  canManageAnyPlayerPortrait: boolean
  linkedPlayerId: string | null
}
export interface MediaPage {
  items: MediaAsset[]
  nextCursor: string | null
}

// Structural subset of the existing shared /me/capabilities contract. No new action names.
interface AccountMediaCapabilities {
  schemaVersion: number
  organizationId: string
  modules: { goalMedia?: { enabled: boolean } }
  actions: Record<
    'goalMedia.submit' | 'goalMedia.review' | 'goalMedia.publish',
    { enabled: boolean; scopes: { type: string; id: string }[] }
  >
}

export async function readMediaCapabilities(): Promise<MediaCapabilities> {
  const session = readSession()
  if (!session) throw new Error('请先登录账号')
  const data = await mediaRequest<AccountMediaCapabilities>('me/capabilities')
  if (data.schemaVersion !== 1 || data.organizationId !== session.user.organizationId)
    throw new Error('账号能力已变更，请重新登录')
  const granted = (key: keyof AccountMediaCapabilities['actions']) =>
    data.actions?.[key]?.enabled === true &&
    data.actions[key].scopes?.some(
      (scope) =>
        scope.type === 'PLATFORM' ||
        (scope.type === 'ORGANIZATION' && scope.id === session.user.organizationId),
    ) === true
  return {
    enabled: data.modules?.goalMedia?.enabled === true,
    canSubmit: granted('goalMedia.submit'),
    canReview: granted('goalMedia.review'),
    canDirectPublish: granted('goalMedia.publish'),
    canManageAnyPlayerPortrait: granted('goalMedia.publish'),
    linkedPlayerId: session.user.linkedPlayer?.id ?? null,
  }
}

export async function mediaRequest<T>(path: string, data?: unknown, method = 'GET'): Promise<T> {
  const session = readSession()
  if (!session) throw new Error('请先登录账号')
  const response = await fetch(resolveMediaUrl(`/api/${path}`)!, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'X-Organization-Id': session.user.organizationId,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  if (readSession()?.accessToken !== session.accessToken)
    throw new Error('账号已切换，请重新打开媒体管理')
  const value = await response.json()
  if (!response.ok) throw new Error(value.message ?? value.error?.message ?? '媒体操作失败，请重试')
  return value as T
}

export async function privateMediaBlob(path: string, signal: AbortSignal) {
  const session = readSession()
  if (!session) throw new Error('请先登录账号')
  const response = await fetch(resolveMediaUrl(path)!, {
    signal,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  if (!response.ok) throw new Error('图片不存在或不可见')
  if (readSession()?.accessToken !== session.accessToken) throw new Error('账号已切换')
  return response.blob()
}

export function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}
