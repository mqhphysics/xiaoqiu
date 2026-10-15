import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Badge, DataState, Modal, label, useAdminData, type Row } from './shared'
import { Directory } from './Directory'

interface Team {
  name: string
  shortName: string | null
  collegeName: string | null
  description: string | null
  motto: string | null
  crestUrl: string | null
}
interface Registration extends Row {
  updatedAt: string
  status: string
  group: { name: string } | null
  seasonTeam: Team
  rosterSnapshots: Array<{
    id: string
    snapshotVersion: number
    entries: Array<{
      id: string
      displayName: string
      shirtNumber: string
      playerProfile: {
        id: string
        studentRecord: { realName: string; studentNumber: string | null } | null
        linkedUser: { id: string; displayName: string } | null
      }
    }>
  }>
}
interface Data {
  tournament: { name: string; season: { name: string } } | null
  items: Registration[]
}
export function TeamSeasons({
  context,
  tournamentId,
}: {
  context: OrganizationContext
  tournamentId: string
}) {
  const result = useAdminData<Data>(
    context,
    `/admin/campus/team-seasons?tournamentId=${encodeURIComponent(tournamentId)}`,
  )
  const [editing, setEditing] = useState<Registration | null>(null)
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>球队的赛季资料</h2>
            <p>
              {result.data?.tournament
                ? `${result.data.tournament.name} · ${result.data.tournament.season.name}`
                : '先在上方选择赛事与赛季'}
              。名单和号码以本赛季审核后的锁定记录为准。
            </p>
          </div>
          <button className="secondary-button" onClick={result.refresh}>
            刷新
          </button>
        </div>
        <DataState {...result} empty={result.data?.items.length === 0} onRetry={result.refresh} />
        <div className="campus-team-grid">
          {result.data?.items.map((row) => (
            <article className="campus-team-card" key={row.id}>
              <header>
                <div>
                  <h3>{row.seasonTeam.name}</h3>
                  <p>
                    {row.group?.name ?? '尚未分组'} · {row.seasonTeam.collegeName ?? '学院待补充'}
                  </p>
                </div>
                <Badge value={row.status} />
              </header>
              <p>{row.seasonTeam.motto ?? '一起走上绿茵场'}</p>
              <div className="campus-team-card__actions">
                <span>{row.rosterSnapshots[0]?.entries.length ?? 0} 名锁定球员</span>
                <button className="mc-link-button" onClick={() => setEditing(row)}>
                  编辑本赛季资料
                </button>
              </div>
              <details>
                <summary>查看本赛季名单</summary>
                {row.rosterSnapshots[0] ? (
                  <>
                    <p className="mc-muted">锁定版本 {row.rosterSnapshots[0].snapshotVersion}</p>
                    <table className="mc-table">
                      <thead>
                        <tr>
                          <th>号码</th>
                          <th>名单姓名</th>
                          <th>账号</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.rosterSnapshots[0].entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.shirtNumber}</td>
                            <td>{entry.displayName}</td>
                            <td>
                              {entry.playerProfile.linkedUser?.displayName ??
                                '未注册，保留基础资料'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="campus-empty-note">名单尚未审核锁定。</p>
                )}
              </details>
            </article>
          ))}
        </div>
      </section>
      <details className="mc-panel">
        <summary>全部球队基础档案</summary>
        <p className="mc-muted">维护球队长期介绍。具体赛事赛季的显示资料和参赛名单在上方管理。</p>
        <Directory context={context} kind="teams" />
      </details>
      {editing && (
        <Modal
          title={`编辑${editing.seasonTeam.name}的本赛季资料`}
          onClose={() => setEditing(null)}
        >
          <SeasonTeamForm
            context={context}
            registration={editing}
            onDone={() => {
              setEditing(null)
              result.refresh()
            }}
          />
        </Modal>
      )}
    </>
  )
}
function SeasonTeamForm({
  context,
  registration,
  onDone,
}: {
  context: OrganizationContext
  registration: Registration
  onDone: () => void
}) {
  const [form, setForm] = useState({
    name: registration.seasonTeam.name,
    shortName: registration.seasonTeam.shortName ?? '',
    collegeName: registration.seasonTeam.collegeName ?? '',
    motto: registration.seasonTeam.motto ?? '',
    description: registration.seasonTeam.description ?? '',
  })
  return (
    <ActionForm
      context={context}
      method="PATCH"
      path={`/admin/campus/team-seasons/${registration.id}`}
      body={{ ...form, expectedUpdatedAt: registration.updatedAt }}
      submitLabel="保存本赛季资料"
      onDone={onDone}
    >
      <p className="mc-muted">
        这些修改只用于当前赛事赛季；其他赛季的球队资料和锁定名单保持原记录。
      </p>
      <div className="mc-form-grid">
        {[
          ['name', '球队名称'],
          ['shortName', '球队简称'],
          ['collegeName', '学院'],
          ['motto', '球队口号'],
        ].map(([key, title]) => (
          <label key={key} className="mc-field">
            <span>{title}</span>
            <input
              required={key === 'name'}
              value={form[key as keyof typeof form]}
              maxLength={key === 'shortName' ? 80 : 160}
              onChange={(e) => setForm({ ...form, [key!]: e.target.value })}
            />
          </label>
        ))}
        <label className="mc-field">
          <span>本赛季球队介绍</span>
          <textarea
            value={form.description}
            maxLength={600}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
      </div>
    </ActionForm>
  )
}
