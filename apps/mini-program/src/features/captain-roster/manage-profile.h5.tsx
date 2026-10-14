import { useEffect, useRef, useState } from 'react'
import teamCoverImage from '../../assets/home-visual/home-campus-football.webp'
import Taro from '@tarojs/taro'
import { TeamCrest } from '../../components/product-ui'
import { createClientActionId } from '../product/product.repository'
import type { TeamDashboardResponse } from '../product/product.types'
import { RosterApiError } from './roster.repository'
import {
  teamManagementRepository,
  type CaptainTeamProfile,
  type TeamProfileCommand,
} from './team-management.repository'
import { Icon } from './manage-icons.h5'

const splitMottos = (value: string | null | undefined) =>
  (value ?? '')
    .split(/[·|,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
const joinMottos = (tags: string[]) => tags.join(' · ')

const PALETTE = [
  '#1f6b45',
  '#194c34',
  '#2f7d5b',
  '#0f5c8c',
  '#1d3f8f',
  '#6a2c91',
  '#a3262a',
  '#c4512d',
  '#f4c95d',
  '#e7b416',
  '#f0f0eb',
  '#20262b',
]
const HEX = /^#[0-9a-f]{6}$/i

interface Draft {
  name: string
  shortName: string
  collegeName: string
  foundedYear: string
  description: string
  mottos: string[]
  primaryColor: string
  secondaryColor: string
}

const toDraft = (team: CaptainTeamProfile): Draft => ({
  name: team.name,
  shortName: team.shortName ?? '',
  collegeName: team.collegeName ?? '',
  foundedYear: team.foundedYear ? String(team.foundedYear) : '',
  description: team.description ?? '',
  mottos: splitMottos(team.motto),
  primaryColor: team.primaryColor ?? '#1f6b45',
  secondaryColor: team.secondaryColor ?? '#f4c95d',
})

function shade(hex: string, amount: number) {
  if (!HEX.test(hex)) return hex
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * (1 + amount))))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

export function ManageProfileSection({
  teamId,
  team,
  dashboard,
  onSaved,
}: {
  teamId: string
  team: CaptainTeamProfile
  dashboard: TeamDashboardResponse | null
  onSaved: (team: CaptainTeamProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(team))
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('更新球队资料')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pendingKey = useRef<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(toDraft(team))
  }, [team, editing])

  const view = editing ? draft : toDraft(team)
  const yearValid = !draft.foundedYear || /^(19|20)\d{2}$/.test(draft.foundedYear)
  const canSave =
    draft.name.trim().length > 0 &&
    yearValid &&
    HEX.test(draft.primaryColor) &&
    HEX.test(draft.secondaryColor)

  const buildPatch = (): TeamProfileCommand['patch'] => {
    const patch: TeamProfileCommand['patch'] = {}
    const original = toDraft(team)
    if (draft.name.trim() !== original.name) patch.name = draft.name.trim()
    if (draft.shortName.trim() !== original.shortName)
      patch.shortName = draft.shortName.trim() || null
    if (draft.collegeName.trim() !== original.collegeName)
      patch.collegeName = draft.collegeName.trim() || null
    if (draft.description.trim() !== original.description)
      patch.description = draft.description.trim() || null
    if (joinMottos(draft.mottos) !== joinMottos(original.mottos))
      patch.motto = draft.mottos.length ? joinMottos(draft.mottos) : null
    if (draft.primaryColor !== original.primaryColor) patch.primaryColor = draft.primaryColor
    if (draft.secondaryColor !== original.secondaryColor)
      patch.secondaryColor = draft.secondaryColor
    if (draft.foundedYear !== original.foundedYear)
      patch.foundedYear = draft.foundedYear ? Number(draft.foundedYear) : null
    return patch
  }

  const requestSave = () => {
    setError('')
    if (!canSave) {
      setError(!draft.name.trim() ? '球队名称不能为空' : '成立年份请填写四位年份')
      return
    }
    if (!Object.keys(buildPatch()).length) {
      setEditing(false)
      return
    }
    setConfirming(true)
  }

  const save = async () => {
    if (saving) return
    if (reason.trim().length < 2) {
      setError('修改说明至少 2 个字')
      return
    }
    setSaving(true)
    setError('')
    pendingKey.current ??= createClientActionId('team-profile')
    try {
      const saved = await teamManagementRepository.saveProfile(
        teamId,
        { expectedUpdatedAt: team.updatedAt, patch: buildPatch(), reason: reason.trim() },
        pendingKey.current,
      )
      pendingKey.current = null
      onSaved(saved)
      setConfirming(false)
      setEditing(false)
      void Taro.showToast({ title: '已保存', icon: 'success' })
    } catch (issue) {
      if (issue instanceof RosterApiError && issue.status === 409) pendingKey.current = null
      setError(
        issue instanceof RosterApiError && issue.status === 409
          ? '资料已被他人更新，请关闭后重新打开再编辑'
          : issue instanceof Error
            ? issue.message
            : '保存失败',
      )
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(toDraft(team))
    setConfirming(false)
    setEditing(false)
    setError('')
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // The team's own cover photo (same one as the 我的 主队 card), tinted from the left for legibility.
  const coverStyle = {
    backgroundImage: `linear-gradient(90deg, ${withAlpha(shade(view.primaryColor, -0.35), 0.82)} 0%, ${withAlpha(shade(view.primaryColor, -0.25), 0.35)} 45%, rgba(0, 0, 0, 0.05) 100%), url(${teamCoverImage})`,
  }
  const facts = [
    { label: '球队成员', value: dashboard ? String(dashboard.roster.length) : '—' },
    { label: '已赛场次', value: dashboard ? String(dashboard.stats.played) : '—' },
    { label: '所在小组', value: dashboard?.team.groupName ?? '—' },
    { label: '积分', value: dashboard ? String(dashboard.stats.points) : '—' },
  ]

  return (
    <div className={`cmx-profile ${editing ? 'is-editing' : ''}`}>
      <div className="cmx-profile__cover" style={coverStyle}>
        {editing ? (
          <div className="cmx-profile__colors">
            <ColorSwatch
              label="主色"
              value={draft.primaryColor}
              onChange={(v) => set('primaryColor', v)}
            />
            <ColorSwatch
              label="辅色"
              value={draft.secondaryColor}
              onChange={(v) => set('secondaryColor', v)}
            />
          </div>
        ) : (
          <button
            type="button"
            className="cmx-profile__edit"
            aria-label="编辑资料"
            onClick={() => setEditing(true)}
          >
            <span>编辑资料</span>
            <Icon name="edit" size={15} />
          </button>
        )}
      </div>
      <div className="cmx-profile__main">
        <div className="cmx-profile__crest">
          <TeamCrest team={team} size="large" interactive={false} />
        </div>
        <div className="cmx-profile__identity">
          {editing ? (
            <div className="cmx-profile__name-edit">
              <input
                className="cmx-input cmx-input--title"
                value={draft.name}
                maxLength={40}
                aria-label="球队名称"
                placeholder="球队名称"
                onChange={(event) => set('name', event.target.value)}
              />
              <input
                className="cmx-input cmx-input--short"
                value={draft.shortName}
                maxLength={12}
                aria-label="球队简称"
                placeholder="简称"
                title="球队简称"
                onChange={(event) => set('shortName', event.target.value)}
              />
            </div>
          ) : (
            <h3 className="cmx-profile__name">
              {team.name}
              {team.shortName && team.shortName !== team.name ? (
                <span className="cmx-profile__short">{team.shortName}</span>
              ) : null}
            </h3>
          )}
          {editing ? (
            <div className="cmx-profile__meta-edit">
              <input
                className="cmx-input"
                value={draft.collegeName}
                maxLength={40}
                aria-label="学院"
                placeholder="所属学院"
                onChange={(event) => set('collegeName', event.target.value)}
              />
              <label className="cmx-inline-field">
                <span>成立于</span>
                <input
                  className={`cmx-input cmx-input--year ${yearValid ? '' : 'is-invalid'}`}
                  value={draft.foundedYear}
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="成立年份"
                  placeholder="2016"
                  onChange={(event) => set('foundedYear', event.target.value.replace(/\D/g, ''))}
                />
                <span>年</span>
              </label>
            </div>
          ) : (
            <p className="cmx-profile__meta">
              {team.collegeName ?? '校园足球球队'}
              {team.foundedYear ? <span>· 成立于 {team.foundedYear} 年</span> : null}
            </p>
          )}
          <MottoPills
            editing={editing}
            tags={view.mottos}
            onChange={(tags) => set('mottos', tags)}
          />
        </div>
        <dl className="cmx-profile__facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dd>{fact.value}</dd>
              <dt>{fact.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="cmx-profile__intro">
        <h4>球队简介</h4>
        {editing ? (
          <div className="cmx-textarea-wrap">
            <textarea
              className="cmx-textarea"
              value={draft.description}
              maxLength={500}
              rows={4}
              aria-label="球队简介"
              placeholder="介绍一下球队的历史、风格和训练时间"
              onChange={(event) => set('description', event.target.value)}
            />
            <span className="cmx-counter">{draft.description.length}/500</span>
          </div>
        ) : (
          <p className={team.description ? '' : 'is-empty'}>
            {team.description ?? '还没有简介，点击「编辑资料」补充。'}
          </p>
        )}
      </div>
      {editing ? (
        <div className="cmx-profile__actions">
          {error ? (
            <span className="cmx-error" role="alert">
              {error}
            </span>
          ) : null}
          {confirming ? (
            <div className="cmx-confirm" role="group" aria-label="确认保存">
              <span>修改说明</span>
              <input
                className="cmx-input cmx-input--sm"
                value={reason}
                maxLength={100}
                aria-label="修改说明"
                autoFocus
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save()
                }}
              />
              <button
                type="button"
                className="cmx-btn cmx-btn--ghost"
                disabled={saving}
                onClick={() => setConfirming(false)}
              >
                返回
              </button>
              <button
                type="button"
                className="cmx-btn cmx-btn--primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? '保存中…' : '确认保存'}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="cmx-btn cmx-btn--ghost" onClick={cancel}>
                取消
              </button>
              <button type="button" className="cmx-btn cmx-btn--primary" onClick={requestSave}>
                保存
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function MottoPills({
  editing,
  tags,
  onChange,
}: {
  editing: boolean
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (!editing) {
      setAdding(false)
      setValue('')
    }
  }, [editing])
  const commit = () => {
    const next = value.trim().replace(/[·|,，]/g, ' ')
    if (next && !tags.includes(next) && joinMottos([...tags, next]).length <= 160)
      onChange([...tags, next])
    setValue('')
    setAdding(false)
  }
  if (!editing && !tags.length) return null
  return (
    <div className="cmx-pills" aria-label="球队口号">
      {tags.map((tag) => (
        <span className="cmx-pill" key={tag}>
          {tag}
          {editing ? (
            <button
              type="button"
              className="cmx-pill__remove"
              aria-label={`删除口号 ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <Icon name="x" size={11} />
            </button>
          ) : null}
        </span>
      ))}
      {editing ? (
        adding ? (
          <input
            className="cmx-pill cmx-pill--input"
            value={value}
            maxLength={24}
            autoFocus
            aria-label="新口号"
            placeholder="输入后回车"
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
              if (event.key === 'Escape') {
                setValue('')
                setAdding(false)
              }
            }}
          />
        ) : (
          <button type="button" className="cmx-pill cmx-pill--add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} />
            添加口号
          </button>
        )
      ) : null}
    </div>
  )
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="cmx-swatch" ref={ref}>
      <button
        type="button"
        className="cmx-swatch__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cmx-swatch__chip" style={{ background: value }} />
        {label}
        <Icon name="chevron" size={12} />
      </button>
      {open ? (
        <div className="cmx-swatch__panel" role="dialog" aria-label={`选择${label}`}>
          <div className="cmx-swatch__grid">
            {PALETTE.map((color) => (
              <button
                type="button"
                key={color}
                className={`cmx-swatch__option ${color.toLowerCase() === value.toLowerCase() ? 'is-active' : ''}`}
                style={{ background: color }}
                aria-label={color}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
              />
            ))}
          </div>
          <label className="cmx-swatch__custom">
            <span className="cmx-swatch__chip cmx-swatch__chip--rainbow" />
            自定义颜色
            <input
              className="cmx-swatch__native"
              type="color"
              value={HEX.test(value) ? value : '#1f6b45'}
              aria-label={`自定义${label}`}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function withAlpha(color: string, alpha: number) {
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  const value = color.replace('#', '')
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return `rgba(20, 60, 40, ${alpha})`
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
