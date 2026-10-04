import { createClientActionId, request } from '../product/product.repository'
export const identityLabels = {
  STUDENT: '学生',
  PLAYER: '球员',
  TEAM_CAPTAIN: '队长',
  TEAM_COACH: '教练',
  MATCH_REPORTER: '信息管理员',
} as const
export type IdentityKind = keyof typeof identityLabels
export interface IdentityCandidate {
  id: string
  kind: IdentityKind
  displayName: string
  teamId: string | null
  teamName: string | null
}
export interface IdentityApplication {
  id: string
  kind: IdentityKind
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  version: number
  message: string
  decisionNote: string | null
  createdAt: string
  team: { id: string; name: string } | null
}
export interface IdentitySnapshot {
  candidates: IdentityCandidate[]
  hasMoreCandidates: boolean
  applications: IdentityApplication[]
  teams: { id: string; name: string }[]
  notice: string
}
export const identityRepository = {
  get: () => request<IdentitySnapshot>('/me/identity'),
  apply: (
    body: { kind: IdentityKind; candidateId?: string; teamId?: string; message: string },
    key: string,
  ) =>
    request<IdentityApplication>('/me/identity/applications', {
      method: 'POST',
      data: body,
      headers: { 'Idempotency-Key': key },
    }),
}
export const identityActionId = () => createClientActionId('identity')
export function openIdentity() {
  window.dispatchEvent(new Event('xiaoqiu:identity:open'))
}
