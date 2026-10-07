import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Badge, DataState, Modal, Pager, time, useAdminData, label } from './shared'
import type { PageData, Row } from './shared'

export function PeopleManagement({ context }: { context: OrganizationContext }) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [input, setInput] = useState(''),
    [chosen, setChosen] = useState<Row | null>(null)
  const list = useAdminData<PageData>(
    context,
    `/admin/center/users?${new URLSearchParams({ page: String(page), pageSize: '25', query })}`,
  )
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>用户资料与账号管理</h2>
            <p>管理员可查看完整实名、学号和邮箱，点击用户编辑或查看活动。</p>
          </div>
          <button className="secondary-button" onClick={list.refresh}>
            刷新
          </button>
        </div>
        <form
          className="mc-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(input.trim())
          }}
        >
          <input
            aria-label="搜索用户"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="姓名、用户名、学号或邮箱"
          />
          <button>搜索</button>
        </form>
        <DataState {...list} empty={list.data?.items.length === 0} onRetry={list.refresh} />
        {list.data ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>真实姓名</th>
                    <th>学号</th>
                    <th>邮箱</th>
                    <th>组织状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{String(user.displayName)}</strong>
                        <small>{String(user.username)}</small>
                      </td>
                      <td>{String(user.realName ?? '未填写')}</td>
                      <td>{String(user.studentId ?? '未填写')}</td>
                      <td>{String(user.email ?? '未填写')}</td>
                      <td>
                        <UserState status={String(user.membershipStatus)} />
                      </td>
                      <td>
                        <button className="mc-link-button" onClick={() => setChosen(user)}>
                          资料 / 活动 / 管理 ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager data={list.data} page={page} onPage={setPage} />
          </>
        ) : null}
      </section>
      {chosen ? (
        <UserDetail
          key={chosen.id}
          context={context}
          row={chosen}
          onClose={() => setChosen(null)}
          onChanged={() => {
            setChosen(null)
            list.refresh()
          }}
        />
      ) : null}
    </>
  )
}
function UserState({ status }: { status: string }) {
  return status === 'SUSPENDED' ? (
    <span className="mc-badge mc-status-suspended">已冻结</span>
  ) : status === 'LEFT' ? (
    <span className="mc-badge mc-status-hidden">已封禁 / 已退出</span>
  ) : (
    <Badge value={status} />
  )
}
function UserDetail({
  context,
  row,
  onClose,
  onChanged,
}: {
  context: OrganizationContext
  row: Row
  onClose: () => void
  onChanged: () => void
}) {
  const data = useAdminData<Row>(context, `/admin/center/users/${row.id}`)
  const [tab, setTab] = useState('info'),
    [action, setAction] = useState<'FREEZE' | 'BAN' | 'RESTORE' | null>(null),
    [editing, setEditing] = useState(false)
  const target = data.data ?? row
  const protectedUser =
    row.id === context.userId ||
    (row.roles as { role: string }[]).some((r) =>
      ['ORGANIZATION_ADMIN', 'PLATFORM_ADMIN'].includes(r.role),
    )
  return (
    <Modal title={String(row.displayName)} variant="drawer" onClose={onClose}>
      <div className="mc-tabs gov-detail-tabs">
        <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
          完整资料
        </button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          活动记录
        </button>
        <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>
          登录会话
        </button>
      </div>
      <DataState {...data} onRetry={data.refresh} />
      {editing ? (
        <EditUser context={context} row={target} onDone={onChanged} />
      ) : action ? (
        <ActionForm
          context={context}
          path={`/admin/center/users/${row.id}/sanctions`}
          body={{ action, expectedUpdatedAt: target.membershipUpdatedAt }}
          submitLabel={
            action === 'BAN'
              ? '确认封禁账号'
              : action === 'FREEZE'
                ? '确认冻结账号'
                : '确认恢复访问'
          }
          onDone={onChanged}
        >
          <p>
            {action === 'RESTORE'
              ? '恢复该用户在本组织的访问。'
              : '将撤销该用户本组织的登录会话，禁止继续登录和账号操作。历史资料与记录保留。'}
          </p>
          <UserState status={String(target.membershipStatus)} />
        </ActionForm>
      ) : tab === 'activity' ? (
        <Activity context={context} id={row.id} />
      ) : tab === 'sessions' ? (
        <div className="gov-detail-body">
          <h3>已记录的登录会话</h3>
          {(target.sessions as Row[] | undefined)?.map((s) => (
            <div key={s.id} className="gov-activity">
              <strong>{s.revokedAt ? '已撤销' : '会话记录'}</strong>
              <span>{time(s.createdAt)}</span>
              <p>
                IP：{String(s.ipAddress ?? '未记录')}
                <br />
                客户端：{String(s.userAgent ?? '未记录')}
                <br />
                最近活动：{time(s.lastSeenAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="gov-detail-body">
          <dl className="mc-facts">
            {[
              ['用户名', target.username],
              ['昵称', target.displayName],
              ['真实姓名', target.realName],
              ['学号', target.studentId],
              ['邮箱', target.email],
              ['简介', target.bio],
              ['关联球员编号', target.playerProfileId],
              ['创建时间', time(target.createdAt)],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <dt>{String(key)}</dt>
                <dd>{String(value ?? '未填写')}</dd>
              </div>
            ))}
          </dl>
          <div className="mc-actions">
            <button disabled={!data.data} onClick={() => setEditing(true)}>
              编辑用户资料
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser}
              onClick={() => setAction('FREEZE')}
            >
              冻结账号
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser}
              onClick={() => setAction('BAN')}
            >
              封禁账号
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser || target.membershipStatus === 'ACTIVE'}
              onClick={() => setAction('RESTORE')}
            >
              恢复访问
            </button>
          </div>
          <p className="mc-muted">
            冻结是暂时停用；封禁是长期禁止本组织访问。两者都会撤销有效会话，恢复须记录原因。
          </p>
        </div>
      )}
    </Modal>
  )
}
const fields = [
  ['username', '用户名'],
  ['displayName', '昵称'],
  ['realName', '真实姓名'],
  ['studentId', '学号'],
  ['email', '邮箱'],
  ['bio', '简介'],
  ['playerProfileId', '关联球员稳定编号'],
] as const
function EditUser({
  context,
  row,
  onDone,
}: {
  context: OrganizationContext
  row: Row
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([key]) => [key, String(row[key] ?? '')])),
  )
  const patch = Object.fromEntries(
    fields
      .filter(([key]) => values[key] !== String(row[key] ?? ''))
      .map(([key]) => [key, values[key]?.trim() || null]),
  )
  return (
    <ActionForm
      context={context}
      path={`/admin/center/users/${row.id}`}
      method="PATCH"
      body={{ patch, expectedUpdatedAt: row.updatedAt }}
      submitLabel="保存用户资料"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        {fields.map(([key, title]) => (
          <label className="mc-field" key={key}>
            <span>{title}</span>
            {key === 'bio' ? (
              <textarea
                aria-label={title}
                maxLength={280}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            ) : (
              <input
                aria-label={title}
                value={values[key]}
                type={key === 'email' ? 'email' : 'text'}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                maxLength={
                  key === 'email' ? 254 : ['studentId', 'username'].includes(key) ? 32 : 120
                }
              />
            )}
          </label>
        ))}
      </div>
      <p className="mc-muted">
        按当前账号编号修改。学号、邮箱和球员关联若冲突，后台会拒绝保存；不会按同名覆盖另一人。
      </p>
    </ActionForm>
  )
}
function Activity({ context, id }: { context: OrganizationContext; id: string }) {
  const [page, setPage] = useState(1)
  const result = useAdminData<PageData & { coverage: string }>(
    context,
    `/admin/center/users/${id}/activity?page=${page}&pageSize=25`,
  )
  return (
    <div className="gov-detail-body">
      <h3>已保存的活动记录</h3>
      <p className="mc-muted">{result.data?.coverage ?? '只显示已保存的记录，不补造历史操作。'}</p>
      <DataState {...result} empty={result.data?.items.length === 0} onRetry={result.refresh} />
      {result.data ? (
        <>
          {result.data.items.map((item) => (
            <article key={`${item.kind}:${item.id}`} className="gov-activity">
              <div>
                <strong>{label(item.action)}</strong>
                <time>{time(item.occurredAt)}</time>
              </div>
              <p>{String(item.summary ?? '')}</p>
              <small>
                {String(item.source)} · {String(item.targetType)} · {String(item.targetId)}
              </small>
            </article>
          ))}
          <Pager data={result.data} page={page} onPage={setPage} />
        </>
      ) : null}
    </div>
  )
}
