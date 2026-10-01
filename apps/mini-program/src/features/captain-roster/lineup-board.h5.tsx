import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Taro from '@tarojs/taro'
import { readSession } from '../product/session'
import { resolveMediaUrl } from '../product/product.repository'
import { positionLabel } from '../product/product.format'
import { assignPlayer, createFormation, draftStorageKey, fillByPosition, FORMATIONS, moveSlot, restoreDraft, type LineupDraft, type LineupPlayer } from './lineup.logic'
import type { LineupBoardProps } from './lineup-board'
import './lineup.scss'

interface DragState {
  pointerId: number
  playerId: string | null
  slotId: string | null
  originX: number
  originY: number
  moved: boolean
  element: HTMLElement
}

export default function LineupBoard({ players, teamName, tournamentId, teamId }: LineupBoardProps) {
  const session = readSession()
  const storageKey = session ? draftStorageKey(session.user.organizationId, session.user.id, tournamentId, teamId) : ''
  const [draft, setDraft] = useState<LineupDraft>(() => {
    try { return restoreDraft(Taro.getStorageSync(storageKey), players) ?? createFormation() } catch { return createFormation() }
  })
  const [templates, setTemplates] = useState<LineupDraft[]>(() => {
    try {
      const saved: unknown = Taro.getStorageSync(`${storageKey}:templates`)
      return Array.isArray(saved) ? saved.flatMap((item) => { const template = restoreDraft(item, []); return template ? [template] : [] }).slice(0, 12) : []
    } catch { return [] }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('拖动球员到位置，或先选球员再点位置。')
  const [query, setQuery] = useState('')
  const [freeMove, setFreeMove] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState<LineupDraft[]>([])
  const [future, setFuture] = useState<LineupDraft[]>([])
  const pitch = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const highlighted = useRef<HTMLElement | null>(null)
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const starters = new Set(draft.slots.flatMap((slot) => slot.playerId ? [slot.playerId] : []))
  const substitutes = players.filter((player) => !starters.has(player.id))
  const bench = substitutes.filter((player) => `${player.displayName} ${player.shirtNumber ?? ''}`.includes(query.trim()))

  const change = (next: LineupDraft, message?: string) => {
    if (next === draft) return
    setHistory((items) => [...items.slice(-29), draft]); setFuture([]); setDraft(next); setDirty(true)
    if (message) setNotice(message)
  }
  const clearDrag = () => {
    const current = drag.current
    if (current) {
      current.element.classList.remove('lineup-drag-source')
      if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
    }
    drag.current = null
    if (ghost.current) ghost.current.style.display = 'none'
    highlighted.current?.classList.remove('lineup-drop-active')
    highlighted.current = null
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearDrag(); setSelected(null); setNotice('已取消本次选位。') }
    }
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('keydown', escape); window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('beforeunload', warn); clearDrag() }
  }, [dirty])

  const startDrag = (event: ReactPointerEvent<HTMLElement>, playerId: string | null, slotId: string | null = null) => {
    if (event.button !== 0 || !event.isPrimary || drag.current || (!playerId && !freeMove)) return
    const element = event.currentTarget
    drag.current = { pointerId: event.pointerId, playerId, slotId, originX: event.clientX, originY: event.clientY, moved: false, element }
    element.setPointerCapture(event.pointerId)
    suppressClick.current = false
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!current.moved && Math.hypot(event.clientX - current.originX, event.clientY - current.originY) < 6) return
    current.moved = true; current.element.classList.add('lineup-drag-source')
    if (ghost.current) {
      ghost.current.style.display = 'flex'
      ghost.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`
      ghost.current.textContent = current.playerId ? playerMap.get(current.playerId)?.displayName ?? '' : draft.slots.find((slot) => slot.id === current.slotId)?.label ?? ''
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-lineup-slot], [data-lineup-bench]') ?? null
    if (target !== highlighted.current) { highlighted.current?.classList.remove('lineup-drop-active'); target?.classList.add('lineup-drop-active'); highlighted.current = target }
  }
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.moved) {
      suppressClick.current = true
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-lineup-slot], [data-lineup-bench]')
      const rect = pitch.current?.getBoundingClientRect()
      if (target?.hasAttribute('data-lineup-bench') && current.playerId) {
        change(assignPlayer(draft, current.playerId, null), '球员已移至替补。')
      } else if (freeMove && current.slotId && rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        change(moveSlot(draft, current.slotId, (event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100), '站位已调整，可保存为自定义战术。')
      } else if (target?.dataset.lineupSlot && current.playerId) {
        change(assignPlayer(draft, current.playerId, target.dataset.lineupSlot), '首发位置已更新；占用位置会自动交换球员。')
      } else { setNotice('没有放到有效位置，球员已回到原处。') }
      setSelected(null)
    }
    clearDrag()
  }
  const choosePlayer = (player: LineupPlayer) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    setSelected(selected === player.id ? null : player.id)
    setNotice(`已选择 ${player.displayName}，请点一个场上位置。Esc 取消。`)
  }
  const chooseSlot = (slotId: string) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    const slot = draft.slots.find((item) => item.id === slotId)!
    if (selected) { change(assignPlayer(draft, selected, slotId), `已安排到 ${slot.label}。`); setSelected(null) }
    else if (slot.playerId) { setSelected(slot.playerId); setNotice('已选择场上球员，点击另一个位置可交换，点击替补区可移出首发。') }
    else { setNotice(`这是空位 ${slot.label}，先从替补区选择球员。`) }
  }
  const saveDraft = () => {
    if (!storageKey || readSession()?.user.id !== session?.user.id) { setNotice('请先重新登录队长账号。'); return }
    try { Taro.setStorageSync(storageKey, draft); setDirty(false); setNotice('战术草稿已保存在本机，刷新可恢复。') } catch { setNotice('本机存储失败，草稿仍在页面中，请勿关闭。') }
  }
  const saveTemplate = () => {
    const name = draft.name.trim()
    if (!name) { setNotice('请先为自定义战术命名。'); return }
    const template = { ...draft, name, custom: true, slots: draft.slots.map((slot) => ({ ...slot, playerId: null })) }
    const next = [...templates.filter((item) => item.name !== name), template].slice(-12)
    try { Taro.setStorageSync(`${storageKey}:templates`, next); setTemplates(next); setNotice(`已保存战术「${name}」，只保存站位，不绑定球员。`) } catch { setNotice('保存自定义战术失败，请检查本机存储。') }
  }

  return <section className="lineup-workbench" aria-label="队长战术排阵">
    <div className="lineup-heading">
      <div><span className="lineup-eyebrow">TACTICS ROOM</span><h2>把你的阵容，排上球场</h2><p>{teamName} · 战术规划与报名名单分别保存</p></div>
      <button className="lineup-primary" onClick={saveDraft}>保存战术草稿{dirty ? ' *' : ''}</button>
    </div>
    <div className="lineup-toolbar">
      <label>阵型<select aria-label="选择阵型" value={draft.custom ? 'custom' : draft.formation} onChange={(event) => { if (event.target.value !== 'custom') change(createFormation(event.target.value, draft), '阵型已切换，已选首发保留；人数减少时多余球员转入替补。') }}>
        {draft.custom && <option value="custom">自定义站位</option>}
        {FORMATIONS.map((formation) => <option key={formation.name} value={formation.name}>{formation.name} · {formation.format} 人制</option>)}
      </select></label>
      <button className={freeMove ? 'is-active' : ''} aria-pressed={freeMove} onClick={() => { setFreeMove(!freeMove); setNotice(freeMove ? '拖拽球员可交换首发位置。' : '自由站位：拖动场上标记，调整战术坐标；方向键也可微调。') }}>{freeMove ? '自由站位：开启' : '自定义站位'}</button>
      <button onClick={() => change(fillByPosition(draft, players), '已按球员登记位置填入空位，请核对首发。')}>按位置填入</button>
      <div className="lineup-toolbar__history">
        <button disabled={!history.length} aria-label="撤销排阵" onClick={() => { const previous = history[history.length - 1]!; setFuture([...future, draft]); setHistory(history.slice(0, -1)); setDraft(previous); setDirty(true) }}>撤销</button>
        <button disabled={!future.length} aria-label="重做排阵" onClick={() => { const next = future[future.length - 1]!; setHistory([...history, draft]); setFuture(future.slice(0, -1)); setDraft(next); setDirty(true) }}>重做</button>
      </div>
    </div>
    <div className="lineup-layout">
      <div className="lineup-pitch-panel">
        <div className="lineup-pitch-caption"><span>{draft.custom ? draft.name || '自定义战术' : draft.formation}</span><span>首发 {starters.size}/{draft.slots.length} · 进攻方向 ↑</span></div>
        <div ref={pitch} className={`lineup-pitch ${freeMove ? 'lineup-pitch--free' : ''}`}>
          <div className="lineup-pitch__boundary" aria-hidden="true"><div className="lineup-pitch__half" /><div className="lineup-pitch__circle" /><div className="lineup-pitch__spot" /><div className="lineup-pitch__box lineup-pitch__box--top" /><div className="lineup-pitch__box lineup-pitch__box--bottom" /><div className="lineup-pitch__goal lineup-pitch__goal--top" /><div className="lineup-pitch__goal lineup-pitch__goal--bottom" /></div>
          {draft.slots.map((slot) => {
            const player = slot.playerId ? playerMap.get(slot.playerId) : undefined
            return <button key={slot.id} data-lineup-slot={slot.id} className={`lineup-slot ${player ? 'lineup-slot--filled' : ''} ${selected && selected === slot.playerId ? 'is-selected' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} aria-label={`${slot.label} ${player?.displayName ?? '空位'}`} aria-pressed={selected !== null && selected === slot.playerId} onPointerDown={(event) => startDrag(event, slot.playerId, slot.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={clearDrag} onLostPointerCapture={() => { if (drag.current) clearDrag() }} onClick={() => chooseSlot(slot.id)} onKeyDown={(event) => {
              if (!freeMove || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
              event.preventDefault()
              change(moveSlot(draft, slot.id, slot.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), slot.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)))
            }}>
              <span className={`lineup-shirt ${slot.label === 'GK' ? 'lineup-shirt--keeper' : ''}`}>{player?.shirtNumber ?? (player ? '—' : '+')}</span>
              <span className="lineup-slot__name">{player?.displayName ?? slot.label}</span><span className="lineup-slot__position">{slot.label}</span>
            </button>
          })}
        </div>
        <div className="lineup-pitch-footer"><span>号码球衣 · 本队真实成员</span><button onClick={async () => { const result = await Taro.showModal({ title: '清空首发', content: '球员将回到替补区，已保存的草稿不会被覆盖。', confirmText: '清空' }); if (result.confirm) change({ ...draft, slots: draft.slots.map((slot) => ({ ...slot, playerId: null })) }, '首发已清空。') }}>清空首发</button></div>
      </div>
      <aside className="lineup-bench" data-lineup-bench="true">
        <div className="lineup-bench__heading"><div><span className="lineup-eyebrow">ON THE BENCH</span><h3>替补与待安排</h3></div><strong>{substitutes.length}</strong></div>
        <input aria-label="搜索本队球员" placeholder="搜索姓名或号码" value={query} onChange={(event) => setQuery(event.target.value)} />
        <p className="lineup-bench__hint">拖入球场成为首发，拖回这里成为替补。</p>
        <div className="lineup-bench__list">{bench.map((player) => <button key={player.id} className={`lineup-player ${selected === player.id ? 'is-selected' : ''}`} aria-label={`选择${player.displayName}`} aria-pressed={selected === player.id} onPointerDown={(event) => startDrag(event, player.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={clearDrag} onClick={() => choosePlayer(player)}>
          <PlayerPortrait player={player} /><span className="lineup-player__copy"><strong>{player.displayName}</strong><small>{positionLabel(player.position)} · {player.shirtNumber ?? '未设'} 号</small></span><span className="lineup-player__grip" aria-hidden="true">⠿</span>
        </button>)}{!bench.length && <p className="lineup-empty">{query ? '没有符合搜索的本队球员' : players.length ? '所有球员均已安排首发' : '本队还没有已关联档案的球员'}</p>}</div>
        <button className="lineup-bench__remove" disabled={!selected || !starters.has(selected)} onClick={() => { if (selected) change(assignPlayer(draft, selected, null), '已移至替补。'); setSelected(null) }}>将所选球员移至替补</button>
      </aside>
    </div>
    <div className="lineup-custom"><label>战术名称<input aria-label="战术名称" maxLength={32} placeholder="例如：边路推进" value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} /></label><button onClick={saveTemplate}>保存为自定义战术</button>{templates.map((template) => <span className="lineup-template" key={template.name}><button onClick={() => {
      const sameSize = draft.slots.length === template.slots.length
      const base = sameSize ? draft : createFormation(template.formation, draft)
      change({ ...template, slots: template.slots.map((slot, index) => ({ ...slot, playerId: base.slots[index]?.playerId ?? null })) }, `已应用「${template.name}」。`)
    }}>{template.name}</button><button aria-label={`删除战术${template.name}`} onClick={() => { const next = templates.filter((item) => item.name !== template.name); try { Taro.setStorageSync(`${storageKey}:templates`, next); setTemplates(next) } catch { setNotice('删除战术失败。') } }}>×</button></span>)}</div>
    <div className="lineup-status" role="status" aria-live="polite">{notice}</div><p className="lineup-local-note">战术草稿保存在当前账号的本机浏览器，尚未同步给队员。正式参赛资格以赛事锁定名单为准。</p>
    <div ref={ghost} className="lineup-drag-ghost" aria-hidden="true" />
  </section>
}

function PlayerPortrait({ player }: { player: LineupPlayer }) {
  const [failed, setFailed] = useState(false)
  const url = resolveMediaUrl(player.avatarUrl)
  return <span className="lineup-portrait">{url && !failed ? <img src={url} alt="" draggable={false} onError={() => setFailed(true)} /> : <span>{player.displayName.slice(0, 1)}</span>}<small>{player.shirtNumber ?? '—'}</small></span>
}
