import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAFT_MAX_AGE_MS,
  QUICK_REPORT_TYPE,
  createDraftKey,
  getRestoreDecision,
  mergeNonConflictingChanges,
  type QuickReportDraft,
  type QuickReportFields,
} from './quick-report.logic.ts'

const baseFields: QuickReportFields = {
  homeScore: 1,
  awayScore: 0,
  outcome: 'FINISHED',
  goals: [{ id: 'goal-1', team: 'HOME', minute: 12, scorer: '7 号' }],
  notes: '',
}

function createDraft(overrides: Partial<QuickReportDraft> = {}): QuickReportDraft {
  return {
    context: {
      organizationId: 'org-east-campus',
      matchId: 'match-001',
      userId: 'user-reporter-01',
      reportType: QUICK_REPORT_TYPE,
    },
    baseVersion: 3,
    baseFields,
    fields: baseFields,
    savedAt: new Date('2026-06-10T08:00:00.000Z').toISOString(),
    ...overrides,
  }
}

test('draft key includes organization, match, user and report type', () => {
  assert.equal(
    createDraftKey(createDraft().context),
    'draft:org-east-campus:match-001:user-reporter-01:QUICK_MATCH_REPORT',
  )
})

test('restore decision restores only a fresh draft based on the current version', () => {
  const now = Date.parse('2026-06-10T09:00:00.000Z')
  assert.equal(getRestoreDecision(createDraft(), 3, now), 'RESTORE')
  assert.equal(getRestoreDecision(createDraft(), 4, now), 'CONFLICT')
  assert.equal(getRestoreDecision(null, 3, now), 'NONE')
})

test('restore decision expires drafts older than seven days', () => {
  const now = Date.parse('2026-06-10T08:00:00.000Z') + DRAFT_MAX_AGE_MS + 1
  assert.equal(getRestoreDecision(createDraft(), 3, now), 'EXPIRED')
})

test('conflict merge keeps local-only changes and accepts current server changes', () => {
  const local: QuickReportFields = {
    ...baseFields,
    notes: '本地补充：下半场开始前已核对。',
  }
  const current: QuickReportFields = {
    ...baseFields,
    awayScore: 1,
  }

  const result = mergeNonConflictingChanges(baseFields, local, current)

  assert.deepEqual(result.conflicts, [])
  assert.equal(result.merged.notes, local.notes)
  assert.equal(result.merged.awayScore, 1)
})

test('conflict merge never silently overwrites a field changed on both sides', () => {
  const local: QuickReportFields = {
    ...baseFields,
    homeScore: 2,
  }
  const current: QuickReportFields = {
    ...baseFields,
    homeScore: 3,
  }

  const result = mergeNonConflictingChanges(baseFields, local, current)

  assert.deepEqual(result.conflicts, ['homeScore'])
  assert.equal(result.merged.homeScore, 3)
})
