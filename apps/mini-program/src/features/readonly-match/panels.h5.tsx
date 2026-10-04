import { useMemo, useState, type ReactNode } from 'react'
import { TeamCrest } from '../../components/product-ui'
import { eventLabel, positionLabel } from '../product/product.format'
import { openPlayer } from '../product/player-navigation'
import type { MatchExperienceResponse } from '../product/product.types'
import {
  collectPlayerEvents,
  hasPublishedPositions,
  lineupGroups,
  lineupHasAppearances,
  minuteLabel,
  orderedEvents,
  playerEventDetails,
  playerAppearanceLabel,
  type MatchLineup,
  type PlayerMatchEvents,
} from './lineup.logic'
import './panels.h5.scss'
import {
  GoalMedia,
  MediaLibraryButton,
  MediaUploadButton,
  useMatchGoalMedia,
} from '../managed-media/index.h5'

export function LineupsPanel({ match }: { match: MatchExperienceResponse }) {
  const [teamId, setTeamId] = useState(match.lineups[0]?.team.id ?? '')
  const selectedId = match.lineups.some((lineup) => lineup.team.id === teamId)
    ? teamId
    : match.lineups[0]?.team.id
  return (
    <section className="match-tab-content match-lineups" aria-label="双方阵容">
      <div className="match-panel-heading">
        <div>
          <small>STARTING LINEUPS</small>
          <h2>双方阵容</h2>
        </div>
        <span>八人制 · 首发与比赛事件</span>
      </div>
      <div className="match-lineups__switch" aria-label="选择球队">
        {match.lineups.map((lineup) => (
          <button
            type="button"
            className="match-lineups__team-switch"
            aria-pressed={selectedId === lineup.team.id}
            key={lineup.team.id}
            onClick={() => setTeamId(lineup.team.id)}
          >
            {lineup.team.shortName}
          </button>
        ))}
      </div>
      {match.lineups.length === 0 ? (
        <p className="match-lineups__empty">阵容尚未公布</p>
      ) : (
        <div className="match-lineups__teams">
          {match.lineups.map((lineup) => (
            <LineupCard
              key={lineup.team.id}
              lineup={lineup}
              match={match}
              selected={selectedId === lineup.team.id}
            />
          ))}
        </div>
      )}
      <p className="match-lineups__footnote">
        点击号码查看球员与真实事件。球队默认阵容不代替本场首发；已确认赛前首发与正式出场记录分别标示。
      </p>
    </section>
  )
}

function LineupCard({
  lineup,
  match,
  selected,
}: {
  lineup: MatchLineup
  match: MatchExperienceResponse
  selected: boolean
}) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const events = useMemo(
    () => collectPlayerEvents(match.events, lineup.team.id),
    [match.events, lineup.team.id],
  )
  const { starters, substitutes } = lineupGroups(lineup)
  const appearances = lineupHasAppearances(lineup)
  const positioned = hasPublishedPositions(starters)
  const activePlayer = lineup.players.find((player) => player.id === playerId)
  return (
    <article className="match-lineup-card" data-selected={selected}>
      <header>
        <TeamCrest team={lineup.team} size="small" />
        <div>
          <h3>{lineup.team.name}</h3>
          <span>阵型：{lineup.formation || '未提供'}</span>
        </div>
        <span className="match-lineup-card__count">
          {starters.length
            ? `${appearances ? '实际首发' : '已确认首发'} ${starters.length}`
            : '首发未提供'}
        </span>
      </header>
      {!appearances && starters.length > 0 && (
        <p className="match-lineup-card__note match-lineup-card__confirmation">
          已确认赛前首发{lineup.confirmedVersion ? ` v${lineup.confirmedVersion}` : ''}
          （实际出场未录入）
        </p>
      )}
      {starters.length ? (
        <>
          <div
            className={`match-pitch ${positioned ? 'match-pitch--positioned' : 'match-pitch--unpositioned'}`}
            aria-label={`${lineup.team.name}首发${positioned ? '站位' : '名单，站位未提供'}`}
          >
            <div className="match-pitch__markings" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span className="match-pitch__caption">
              {appearances ? '实际首发' : '已确认赛前首发'}
              {positioned ? '' : ' · 站位未提供'}
            </span>
            <div className="match-pitch__players">
              {starters.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  className="match-pitch-player"
                  aria-pressed={playerId === player.id}
                  aria-label={`${player.displayName}，${player.shirtNumber ?? '无'}号，${playerEventDetails(events.get(player.id)).join('；') || '暂无事件'}`}
                  style={
                    positioned && player.pitchPosition
                      ? {
                          left: `${10 + player.pitchPosition.x * 0.8}%`,
                          top: `${10 + player.pitchPosition.y * 0.8}%`,
                        }
                      : undefined
                  }
                  onClick={() => setPlayerId(playerId === player.id ? null : player.id)}
                >
                  <span className="match-pitch-player__shirt">{player.shirtNumber ?? '—'}</span>
                  <span className="match-pitch-player__name">{player.displayName}</span>
                  <EventBadges events={events.get(player.id)} compact />
                </button>
              ))}
            </div>
          </div>
          {!positioned && (
            <p className="match-lineup-card__note">
              已公布首发名单；未提供战术站位，球员按名单展示。
            </p>
          )}
        </>
      ) : (
        <p className="match-lineups__empty">本场首发尚未确认</p>
      )}
      {activePlayer && (
        <div className="match-player-detail" aria-live="polite">
          <strong>
            {activePlayer.shirtNumber ?? '—'}号 · {activePlayer.displayName} ·{' '}
            {activePlayer.starter ? '首发' : '替补'}
          </strong>
          <span>
            {positionLabel(activePlayer.position)} ·{' '}
            {playerAppearanceLabel(activePlayer, appearances, events.get(activePlayer.id))}
          </span>
          <span>
            {playerEventDetails(events.get(activePlayer.id)).join(' · ') || '暂无已公布比赛事件'}
          </span>
          <button
            type="button"
            data-match-resource="player"
            className="match-player-detail__profile"
            onClick={() => void openPlayer(activePlayer.id, match.tournamentId)}
          >
            查看球员资料 ↗
          </button>
        </div>
      )}
      <PlayerList
        title="首发名单"
        players={starters}
        events={events}
        onSelect={setPlayerId}
        selectedId={playerId}
        appearances={appearances}
      />
      <PlayerList
        title="替补名单"
        players={substitutes}
        events={events}
        onSelect={setPlayerId}
        selectedId={playerId}
        appearances={appearances}
      />
    </article>
  )
}

function PlayerList({
  title,
  players,
  events,
  onSelect,
  selectedId,
  appearances,
}: {
  title: string
  players: MatchLineup['players']
  events: Map<string, PlayerMatchEvents>
  onSelect: (id: string | null) => void
  selectedId: string | null
  appearances: boolean
}) {
  return (
    <section className="match-lineup-list">
      <h4>
        {title}
        <span>{players.length} 人</span>
      </h4>
      {players.length ? (
        players.map((player) => {
          const playerEvents = events.get(player.id)
          return (
            <button
              type="button"
              className="match-lineup-list__player"
              key={player.id}
              aria-pressed={selectedId === player.id}
              onClick={() => onSelect(selectedId === player.id ? null : player.id)}
            >
              <span className="match-lineup-list__number">{player.shirtNumber ?? '—'}</span>
              <span className="match-lineup-list__name">
                <strong>{player.displayName}</strong>
                <small>
                  {positionLabel(player.position)} ·{' '}
                  {playerAppearanceLabel(player, appearances, playerEvents)}
                </small>
              </span>
              <EventBadges events={playerEvents} />
            </button>
          )
        })
      ) : (
        <p className="match-lineup-card__note">暂无已公布{title}</p>
      )}
    </section>
  )
}

function EventBadges({
  events,
  compact = false,
}: {
  events?: PlayerMatchEvents | undefined
  compact?: boolean
}) {
  if (!events) return null
  return (
    <span className="match-player-badges">
      {events.goals.length > 0 && <span>球 {events.goals.length}</span>}
      {events.assists.length > 0 && <span>助 {events.assists.length}</span>}
      {events.ownGoals.length > 0 && <span>乌龙 {events.ownGoals.length}</span>}
      {events.on.map((minute, index) => (
        <span key={`on-${index}`}>换上 {minute}</span>
      ))}
      {events.off.map((minute, index) => (
        <span key={`off-${index}`}>换下 {minute}</span>
      ))}
      {!compact && events.yellowCards.length > 0 && <span>黄牌 {events.yellowCards.length}</span>}
      {events.redCards.length > 0 && <span>红牌 {events.redCards.length}</span>}
    </span>
  )
}

export function EventsPanel({ match }: { match: MatchExperienceResponse }) {
  const media = useMatchGoalMedia(match.id)
  const goalMedia = new Map<string, (typeof media.items)[number]>()
  for (const item of media.items)
    if (!goalMedia.has(item.targetId)) goalMedia.set(item.targetId, item)
  return (
    <section className="match-tab-content match-events" aria-label="比赛事件">
      <div className="match-panel-heading">
        <div>
          <small>TIMELINE</small>
          <h2>比赛事件</h2>
        </div>
        <span>{match.events.length} 条</span>
        <MediaLibraryButton />
      </div>
      {match.events.length ? (
        <ol className="match-events__list">
          {orderedEvents(match.events).map((event) => (
            <li key={event.id}>
              <time>{minuteLabel(event)}</time>
              <span className="match-events__type">{eventLabel(event.type)}</span>
              <div>
                <strong>
                  <EventPlayerLink player={event.player} tournamentId={match.tournamentId}>
                    {event.type === 'SUBSTITUTION' ? '换下 ' : ''}
                    {event.player?.displayName ?? event.team.shortName}
                  </EventPlayerLink>
                </strong>
                <span>
                  {event.relatedPlayer ? (
                    <>
                      {event.type === 'SUBSTITUTION' ? '换上 ' : '助攻 '}
                      <EventPlayerLink
                        player={event.relatedPlayer}
                        tournamentId={match.tournamentId}
                      >
                        {event.relatedPlayer.displayName}
                      </EventPlayerLink>
                    </>
                  ) : (
                    (event.description ?? event.team.name)
                  )}
                </span>
                {event.relatedPlayer && <small>{event.team.name}</small>}
                {event.type === 'GOAL' || event.type === 'OWN_GOAL' ? (
                  <>
                    {goalMedia.has(event.id) ? (
                      <GoalMedia asset={goalMedia.get(event.id)!} />
                    ) : null}
                    <MediaUploadButton
                      purpose="GOAL_GIF"
                      targetId={event.id}
                      label="投稿进球 GIF"
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="match-lineups__empty">暂无已公布比赛事件</p>
      )}
      {media.error ? <p role="status">{media.error}</p> : null}
    </section>
  )
}

function EventPlayerLink({
  player,
  tournamentId,
  children,
}: {
  player: MatchExperienceResponse['events'][number]['player']
  tournamentId: string
  children: ReactNode
}) {
  if (!player) return <>{children}</>
  return (
    <button
      type="button"
      className="match-event-player"
      data-match-resource="player"
      aria-label={`查看${player.displayName}的球员资料`}
      onClick={() => void openPlayer(player.id, tournamentId)}
    >
      {children}
    </button>
  )
}
