import type { AuthenticatedSession } from '../auth/auth.service'

// Same value semantics as ProductConfigService's goalMedia module.
export function goalMediaEnabled() {
  const value = process.env.XIAOQIU_FEATURE_GOAL_MEDIA?.trim().toLowerCase()
  return value === undefined || value === '' || value === '1' || value === 'true'
}

// Object policies remain independent from feature availability.
export function mediaPermissions(session: AuthenticatedSession) {
  const platform = session.user.roles.some(
    (role) => role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM',
  )
  const organizationAdmin = session.user.roles.some(
    (role) =>
      role.role === 'ORGANIZATION_ADMIN' &&
      role.scopeType === 'ORGANIZATION' &&
      role.scopeId === session.organizationId,
  )
  return {
    canSubmit: true,
    canReview:
      platform ||
      (process.env.MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN === 'true' && organizationAdmin),
    canDirectPublish: platform,
    canManageAnyPlayerPortrait: platform,
    linkedPlayerId: session.user.linkedPlayer?.id ?? null,
  }
}
