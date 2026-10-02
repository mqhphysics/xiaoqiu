import { useEffect, useState } from 'react'
import { AdminScheduleWorkspace } from '../adminSchedule/AdminScheduleWorkspace'
import type { AdminScheduleSnapshot, OrganizationContext } from '../adminSchedule/types'
import { mapSnapshot } from '../adminSchedule/repository'
import type { ApiAdminScheduleSnapshot } from '../adminSchedule/repository'
import {
  AdminMatchReports,
  AdminProgression,
  AdminRosterReview,
} from '../adminWorkflows/AdminWorkflows'
import { Directory } from './Directory'
import { Content } from './Content'
import { Records } from './Records'
import { Badge, DataState, Icon, PendingCapability, time, useAdminData } from './shared'
import './admin-center.css'

type Section =
  | 'overview'
  | 'accounts'
  | 'people'
  | 'events'
  | 'content'
  | 'media'
  | 'audit'
  | 'system'
const NAV: { id: Section; title: string; icon: string; description: string }[] = [
  { id: 'overview', title: '工作台', icon: 'trophy', description: '从待办开始，让赛事有序进行。' },
  {
    id: 'accounts',
    title: '账号与权限',
    icon: 'shield-check',
    description: '定位账号，维护组织成员与登录安全。',
  },
  {
    id: 'people',
    title: '球队与球员',
    icon: 'users',
    description: '每一支球队，每一位球员，都有清晰的档案。',
  },
  {
    id: 'events',
    title: '赛事与比赛',
    icon: 'calendar',
    description: '从赛程、名单到战报，管理完整比赛流程。',
  },
  {
    id: 'content',
    title: '内容与反馈',
    icon: 'bell',
    description: '发布官方消息，认真处理每一条反馈。',
  },
  {
    id: 'media',
    title: '媒体资料',
    icon: 'bookmark',
    description: '查看当前使用的公开图片及关联对象。',
  },
  {
    id: 'audit',
    title: '操作记录',
    icon: 'pencil',
    description: '让关键修改有原因、有版本、可追溯。',
  },
  {
    id: 'system',
    title: '系统状态',
    icon: 'shield-check',
    description: '检查服务和任务的实际运行情况。',
  },
]
function currentSection(): Section {
  const hash = window.location.hash.slice(1).split('?')[0]
  return NAV.some((n) => n.id === hash) ? (hash as Section) : 'overview'
}
function mapScheduleData(data: unknown) {
  return mapSnapshot(data as ApiAdminScheduleSnapshot)
}
export function AdminCenter({
  context,
  displayName,
  onLogout,
}: {
  context: OrganizationContext
  displayName: string
  onLogout: () => void
}) {
  const [section, setSection] = useState<Section>(currentSection)
  const [search, setSearch] = useState('')
  const [directorySearch, setDirectorySearch] = useState('')
  const [directoryRevision, setDirectoryRevision] = useState(0)
  const schedule = useAdminData<AdminScheduleSnapshot>(
    context,
    '/admin/schedule-workbench',
    mapScheduleData,
  )
  const [tournamentId, setTournamentId] = useState('')
  const selectedTournament =
    schedule.data?.tournaments.find((t) => t.id === tournamentId) ?? schedule.data?.tournaments[0]
  const item = NAV.find((n) => n.id === section)!
  useEffect(() => {
    const change = () => setSection(currentSection())
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  function navigate(next: Section) {
    window.location.hash = next
    setSection(next)
  }
  function runSearch() {
    setDirectorySearch(search.trim())
    setDirectoryRevision((v) => v + 1)
    navigate('people')
  }
  return (
    <div className="mc-shell">
      <a className="mc-skip" href="#mc-content">
        跳到主要内容
      </a>
      <aside className="mc-sidebar">
        <a className="mc-brand" href="#overview" onClick={() => navigate('overview')}>
          <img src="/favicon.svg" alt="" />
          <span>
            <strong>晓球</strong>
            <small>管理中心</small>
          </span>
        </a>
        <div className="mc-nav-label">工作空间</div>
        <nav aria-label="管理中心模块">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={() => navigate(n.id)}
              className={section === n.id ? 'active' : ''}
              aria-current={section === n.id ? 'page' : undefined}
            >
              <Icon name={n.icon} />
              <span>{n.title}</span>
              {section === n.id ? <span className="mc-current-indicator" /> : null}
            </a>
          ))}
        </nav>
        <div className="mc-sidebar-bottom">
          <a href="http://127.0.0.1:3000/" target="_blank" rel="noreferrer">
            打开晓球网站 <span>↗</span>
          </a>
          <div className="mc-account">
            <span className="mc-avatar">{displayName.slice(0, 1)}</span>
            <div>
              <strong>{displayName}</strong>
              <small>{context.canManageOrganization ? '组织管理权限' : '赛事管理权限'}</small>
            </div>
            <button className="mc-logout" aria-label="退出登录" title="退出登录" onClick={onLogout}>
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="mc-body">
        <header className="mc-topbar">
          <span>
            晓球管理中心 <span className="mc-muted">/ {item.title}</span>
          </span>
          <form
            className="mc-search"
            onSubmit={(e) => {
              e.preventDefault()
              runSearch()
            }}
          >
            <Icon name="users" />
            <input
              aria-label="搜索球队或球员"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索球队、球员档案…"
            />
            <button type="submit">搜索</button>
          </form>
          <Badge value={context.role} />
        </header>
        <main id="mc-content" className="mc-main" tabIndex={-1}>
          <header className="mc-page-heading">
            <div>
              <p className="mc-kicker">XIAOQIU / WORKSPACE</p>
              <h1>{item.title}</h1>
              <p>{item.description}</p>
            </div>
            <div className="mc-scope">
              <span>当前赛事</span>
              <select
                aria-label="当前赛事"
                value={selectedTournament?.id ?? ''}
                onChange={(e) => setTournamentId(e.target.value)}
                disabled={schedule.loading || !schedule.data?.tournaments.length}
              >
                <option value="" disabled>
                  选择获授权赛事
                </option>
                {schedule.data?.tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </header>
          {schedule.error ? (
            <div className="mc-alert" role="alert">
              赛事上下文读取失败：{schedule.error}{' '}
              <button className="secondary-button" onClick={schedule.refresh}>
                重试
              </button>
            </div>
          ) : null}
          <div key={`${section}-${context.userId}`} className="mc-page-content">
            {section === 'overview' ? (
              <Overview context={context} navigate={navigate} schedule={schedule.data} />
            ) : null}
            {section === 'accounts' ? (
              context.canManageOrganization ? (
                <Directory context={context} kind="users" />
              ) : (
                <Restricted />
              )
            ) : null}
            {section === 'people' ? (
              context.canManageOrganization ? (
                <People key={directoryRevision} context={context} search={directorySearch} />
              ) : (
                <Restricted />
              )
            ) : null}
            {section === 'events' ? (
              <Events
                context={context}
                displayName={displayName}
                onLogout={onLogout}
                tournamentId={selectedTournament?.id ?? ''}
                schedule={schedule.data}
                onSnapshotChange={schedule.refresh}
              />
            ) : null}
            {section === 'content' ? (
              context.canManageOrganization ? (
                <Content context={context} tournamentId={selectedTournament?.id ?? ''} />
              ) : (
                <Restricted />
              )
            ) : null}
            {section === 'media' || section === 'audit' || section === 'system' ? (
              context.canManageOrganization ? (
                <Records context={context} kind={section} />
              ) : (
                <Restricted />
              )
            ) : null}
          </div>
          <footer className="mc-footer">
            <span>晓球 · 为每一场校园足球</span>
            <span>当前组织 {context.organizationId}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
function Restricted() {
  return (
    <section className="mc-panel mc-state">
      <strong>需要组织管理权限</strong>
      <p>当前账号只能管理获授权的赛事。请前往“赛事与比赛”，或联系本组织管理员。</p>
    </section>
  )
}
function People({ context, search }: { context: OrganizationContext; search: string }) {
  const [kind, setKind] = useState<'teams' | 'players'>(search ? 'players' : 'teams')
  return (
    <>
      <div className="mc-tabs" role="group" aria-label="档案类型">
        <button className={kind === 'teams' ? 'active' : ''} onClick={() => setKind('teams')}>
          球队档案
        </button>
        <button className={kind === 'players' ? 'active' : ''} onClick={() => setKind('players')}>
          球员档案
        </button>
      </div>
      <Directory key={kind} kind={kind} context={context} initialSearch={search} />
      <PendingCapability
        title="身份认领与导入预览"
        description="现有档案按稳定编号维护。批量导入、重复身份核验和跨队认领将在对应服务接通后开放。"
      />
    </>
  )
}
interface OverviewData {
  organization: { id: string; name: string }
  counts: Record<string, number>
  recentAudit?: {
    id: string
    action: string
    targetType: string
    reason: string | null
    createdAt: string
  }[]
}
function Overview({
  context,
  navigate,
  schedule,
}: {
  context: OrganizationContext
  navigate: (s: Section) => void
  schedule: AdminScheduleSnapshot | null
}) {
  const result = useAdminData<OverviewData>(
    context,
    context.canManageOrganization ? '/admin/center/overview' : null,
  )
  const metrics = [
    ['pendingRosters', '待审核名单', 'events'],
    ['pendingReports', '待确认战报', 'events'],
    ['openFeedback', '待处理反馈', 'content'],
    ['users', '组织成员', 'accounts'],
  ] as const
  return (
    <>
      <section className="mc-welcome">
        <div>
          <span className="mc-badge">
            {result.data?.organization.name || '当前组织'} · 工作空间
          </span>
          <h2>
            球场上的精彩，
            <br />
            从这里有序开始。
          </h2>
          <p>
            把资料维护好，把比赛记录清楚。
            <br />
            今天的待办，一件一件完成。
          </p>
          <button onClick={() => navigate('events')}>
            进入赛事管理 <span>↗</span>
          </button>
        </div>
        <div className="mc-field-art" aria-hidden="true">
          <span className="mc-pitch">
            <span />
          </span>
          <span className="mc-art-label">FOR EVERY GAME.</span>
        </div>
      </section>
      {context.canManageOrganization ? (
        <>
          <DataState {...result} onRetry={result.refresh} />
          <section className="mc-metrics" aria-label="当前组织数据">
            {metrics.map(([field, title, to]) => (
              <button key={field} className="mc-metric" onClick={() => navigate(to)}>
                <span>
                  {title}
                  <span>↗</span>
                </span>
                <strong>{result.data ? (result.data.counts[field] ?? '未提供') : '…'}</strong>
                <small>{field === 'users' ? '当前组织成员' : '点击前往处理'}</small>
              </button>
            ))}
          </section>
        </>
      ) : (
        <div className="mc-alert">
          当前以赛事管理员身份工作。组织级账号与反馈不在你的权限范围内。
        </div>
      )}
      <div className="mc-overview-grid">
        <section className="mc-panel">
          <div className="mc-panel-heading">
            <h2>赛事概览</h2>
            <button className="mc-link-button" onClick={() => navigate('events')}>
              管理赛事 ↗
            </button>
          </div>
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>赛事</th>
                  <th>状态</th>
                  <th>比赛数</th>
                </tr>
              </thead>
              <tbody>
                {schedule?.tournaments.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                      <small>
                        {t.code ?? (t as unknown as { tournamentCode: string }).tournamentCode}
                      </small>
                    </td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                    <td>{schedule.matches.filter((m) => m.tournamentId === t.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!schedule?.tournaments.length ? (
              <p className="mc-muted mc-pad">尚无获授权赛事。</p>
            ) : null}
          </div>
        </section>
        <section className="mc-panel">
          <div className="mc-panel-heading">
            <h2>常用操作</h2>
            <span className="mc-muted">从这里开始</span>
          </div>
          {[
            ['events', '名单审核', '核对队伍名单与锁定版本', 'users'],
            ['content', '回复反馈', '查看问题、处理与通知', 'bell'],
            ['people', '维护档案', '修改球队介绍与球员资料', 'pencil'],
          ].map(([to, title, description, icon]) => (
            <button key={title} className="mc-shortcut" onClick={() => navigate(to as Section)}>
              <Icon name={icon!} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span>↗</span>
            </button>
          ))}
        </section>
      </div>
      <PendingCapability
        title="账号核验申请与备份恢复"
        description="人工身份核验、一次性密码恢复和数据/媒体备份尚未接通，当前工作台不生成这些待办或完成状态。"
      />
      {result.data?.recentAudit?.length ? (
        <section className="mc-panel">
          <div className="mc-panel-heading">
            <h2>最近操作</h2>
            <button className="mc-link-button" onClick={() => navigate('audit')}>
              全部记录 ↗
            </button>
          </div>
          {result.data.recentAudit.map((a) => (
            <div className="mc-activity" key={a.id}>
              <span>{a.action}</span>
              <span className="mc-muted">{a.reason || a.targetType}</span>
              <time>{time(a.createdAt)}</time>
            </div>
          ))}
        </section>
      ) : null}
    </>
  )
}
function Events({
  context,
  displayName,
  onLogout,
  tournamentId,
  schedule,
  onSnapshotChange,
}: {
  context: OrganizationContext
  displayName: string
  onLogout: () => void
  tournamentId: string
  schedule: AdminScheduleSnapshot | null
  onSnapshotChange: () => void
}) {
  const [tab, setTab] = useState('reports')
  const tabs = [
    ['reports', '比赛战报'],
    ['rosters', '名单审核'],
    ['schedule', '赛程管理'],
    ['events', '赛季与赛事'],
    ['teams', '球队与场地'],
    ['progression', '规程与晋级'],
  ]
  return (
    <>
      <div className="mc-tabs" role="group" aria-label="赛事管理功能">
        {tabs.map(([id, title]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id!)}>
            {title}
          </button>
        ))}
      </div>
      {tab === 'schedule' || tab === 'events' || tab === 'teams' ? (
        <div className="mc-legacy">
          <AdminScheduleWorkspace
            key={tab}
            context={context}
            displayName={displayName}
            onLogout={onLogout}
            initialSection={tab}
            onSnapshotChange={onSnapshotChange}
          />
        </div>
      ) : !tournamentId ? (
        <div className="mc-panel mc-state">请先选择赛事。你可以在“赛季与赛事”中创建。</div>
      ) : tab === 'reports' ? (
        <AdminMatchReports
          key={`report-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
          matches={schedule?.matches.filter((m) => m.tournamentId === tournamentId) ?? []}
        />
      ) : tab === 'rosters' ? (
        <AdminRosterReview
          key={`roster-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
        />
      ) : (
        <AdminProgression
          key={`progression-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
        />
      )}
    </>
  )
}
