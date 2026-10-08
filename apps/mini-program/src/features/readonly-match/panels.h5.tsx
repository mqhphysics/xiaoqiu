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
import { MatchIcon, type MatchIconKind } from './match-icons.h5'
import { createLineupDisplay } from './lineup-display.h5'
import { PlayerTrigger } from '../../components/player-trigger/index.h5'
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
        <>
          <DesktopLineups match={match} />
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
        </>
      )}
      <p className="match-lineups__footnote">
        点击号码查看球员与真实事件。球队默认阵容不代替本场首发；已确认赛前首发与正式出场记录分别标示。
      </p>
    </section>
  )
}

function DesktopLineups({ match }: { match: MatchExperienceResponse }) {
  const [selected, setSelected] = useState<string | null>(null)
  const lineups = [...match.lineups].sort(
    (a, b) => Number(b.team.id === match.homeTeam?.id) - Number(a.team.id === match.homeTeam?.id),
  )
  const events = useMemo(
    () =>
      new Map(
        lineups.map((lineup) => [
          lineup.team.id,
          collectPlayerEvents(match.events, lineup.team.id),
        ]),
      ),
    [match.events, match.lineups],
  )
  const selectedLineup = lineups.find((lineup) =>
    lineup.players.some((player) => player.id === selected),
  )
  const selectedPlayer = selectedLineup?.players.find((player) => player.id === selected)
  return (
    <div className="match-horizontal-lineups">
      <div className="match-horizontal-lineups__heading">
        {lineups.map((lineup) => (
          <div key={lineup.team.id}>
            <TeamCrest team={lineup.team} size="small" />
            <strong>{lineup.team.name}</strong>
          </div>
        ))}
      </div>
      <div className="match-horizontal-pitch" aria-label="双方首发横向球场">
        <svg
          className="match-horizontal-pitch__lines"
          viewBox="0 0 105 68"
          aria-hidden="true"
          fill="none"
        >
          <rect x=".5" y=".5" width="104" height="67" />
          <path d="M52.5 .5v67M.5 13.84H16.5v40.32H.5M104.5 13.84H88.5v40.32h16M.5 24.84h5v18.32h-5M104.5 24.84h-5v18.32h5" />
          <circle cx="52.5" cy="34" r="9.15" />
          <circle cx="52.5" cy="34" r=".6" fill="currentColor" />
          <circle cx="11" cy="34" r=".5" fill="currentColor" />
          <circle cx="94" cy="34" r=".5" fill="currentColor" />
          <path d="M16.5 26.68a9.15 9.15 0 0 1 0 14.64M88.5 26.68a9.15 9.15 0 0 0 0 14.64M.5 1.5a1 1 0 0 0 1-1M103.5 .5a1 1 0 0 0 1 1M.5 66.5a1 1 0 0 1 1 1M103.5 67.5a1 1 0 0 1 1-1" />
        </svg>
        {lineups.map((lineup, side) => {
          const { starters } = lineupGroups(lineup)
          const display = createLineupDisplay(starters)
          return (
            <div
              key={lineup.team.id}
              className="match-pitch-half match-pitch-half--positioned"
              data-side={side}
              data-position-source={display.source}
              aria-label={`${lineup.team.name}${display.source === 'PUBLISHED' ? '已公布首发站位' : '按球员位置默认排布'}`}
            >
              {starters.length ? (
                display.players.map(({ player, point }) => (
                  <div
                    key={player.id}
                    className={`match-horizontal-player ${player.position === 'GOALKEEPER' ? 'match-horizontal-player--goalkeeper' : ''}`}
                    style={{
                      left: `${side === 0 ? 8 + point.y * 0.84 : 92 - point.y * 0.84}%`,
                      top: `${10 + point.x * 0.8}%`,
                    }}
                  >
                    <button
                      type="button"
                      className="match-horizontal-player__number"
                      aria-pressed={selected === player.id}
                      aria-label={`${player.displayName}，${player.shirtNumber ?? '无'}号，${positionLabel(player.position)}，查看本场事件`}
                      onClick={() => setSelected(selected === player.id ? null : player.id)}
                    >
                      {player.shirtNumber ?? '—'}
                    </button>
                    {player.position === 'GOALKEEPER' && (
                      <span className="match-horizontal-player__keeper" title="门将">
                        GK
                      </span>
                    )}
                    <PlayerTrigger
                      playerId={player.id}
                      tournamentId={match.tournamentId}
                      name={player.displayName}
                    >
                      <span className="match-horizontal-player__name">{player.displayName}</span>
                    </PlayerTrigger>
                    <EventBadges events={events.get(lineup.team.id)?.get(player.id)} compact />
                  </div>
                ))
              ) : (
                <p className="match-horizontal-pitch__empty">本场首发尚未确认</p>
              )}
            </div>
          )
        })}
      </div>
      {selectedPlayer && selectedLineup && (
        <div className="match-player-detail" aria-live="polite">
          <strong>
            {selectedPlayer.shirtNumber ?? '—'}号 · {selectedPlayer.displayName}
          </strong>
          <span>
            {positionLabel(selectedPlayer.position)} ·{' '}
            {playerAppearanceLabel(
              selectedPlayer,
              lineupHasAppearances(selectedLineup),
              events.get(selectedLineup.team.id)?.get(selectedPlayer.id),
            )}
          </span>
          <span>
            {playerEventDetails(events.get(selectedLineup.team.id)?.get(selectedPlayer.id)).join(
              ' · ',
            ) || '暂无已公布比赛事件'}
          </span>
          <button
            type="button"
            data-match-resource="player"
            className="match-player-detail__profile"
            onClick={() => void openPlayer(selectedPlayer.id, match.tournamentId)}
          >
            查看球员资料 ↗
          </button>
        </div>
      )}
      <div className="match-horizontal-lineups__bench">
        {lineups.map((lineup) => (
          <details key={lineup.team.id} open>
            <summary>
              {lineup.team.shortName} · 替补 {lineupGroups(lineup).substitutes.length} 人
            </summary>
            <PlayerList
              title="替补名单"
              players={lineupGroups(lineup).substitutes}
              events={events.get(lineup.team.id)!}
              onSelect={setSelected}
              selectedId={selected}
              appearances={lineupHasAppearances(lineup)}
            />
          </details>
        ))}
      </div>
    </div>
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
    <span className={`match-player-badges ${compact ? 'match-player-badges--compact' : ''}`}>
      {events.goals.length > 0 && (
        <span title={`进球 ${events.goals.join('、')}`}>
          <MatchIcon kind="GOAL" />
          {events.goals.length}
        </span>
      )}
      {events.assists.length > 0 && (
        <span title={`助攻 ${events.assists.join('、')}`}>
          <MatchIcon kind="ASSIST" />
          {events.assists.length}
        </span>
      )}
      {events.ownGoals.length > 0 && (
        <span title={`乌龙球 ${events.ownGoals.join('、')}`}>
          <MatchIcon kind="OWN_GOAL" />
          {events.ownGoals.length}
        </span>
      )}
      {events.on.map((minute, index) => (
        <span key={`on-${index}`} title={`换上 ${minute}`}>
          <MatchIcon kind="ON" />
          {minute}
        </span>
      ))}
      {events.off.map((minute, index) => (
        <span key={`off-${index}`} title={`换下 ${minute}`}>
          <MatchIcon kind="OFF" />
          {minute}
        </span>
      ))}
      {events.yellowCards.length > 0 && (
        <span title={`黄牌 ${events.yellowCards.join('、')}`}>
          <MatchIcon kind="YELLOW_CARD" />
          {events.yellowCards.length}
        </span>
      )}
      {events.redCards.length > 0 && (
        <span title={`红牌 ${events.redCards.join('、')}`}>
          <MatchIcon kind="RED_CARD" />
          {events.redCards.length}
        </span>
      )}
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
      <div className="match-events__tools">
        <MediaLibraryButton />
      </div>
      {match.events.length ? (
        <ol className="match-events__list">
          {orderedEvents(match.events).map((event) => (
            <li
              key={event.id}
              className="match-event"
              data-event-type={event.type}
              title={event.description ?? event.team.name}
            >
              <time>{minuteLabel(event)}</time>
              <span className="match-events__type" title={eventLabel(event.type)}>
                <MatchIcon kind={event.type as MatchIconKind} />
              </span>
              <div className="match-event__copy">
                <strong>
                  <span className="match-event__team">
                    <TeamCrest team={event.team} size="small" interactive={false} />
                  </span>
                  {event.type === 'SUBSTITUTION' && <MatchIcon kind="OFF" />}
                  <EventPlayerLink player={event.player} tournamentId={match.tournamentId}>
                    {event.player?.displayName ?? event.team.shortName}
                  </EventPlayerLink>
                </strong>
                <span>
                  {event.relatedPlayer &&
                  (event.type === 'GOAL' || event.type === 'SUBSTITUTION') ? (
                    <>
                      <MatchIcon kind={event.type === 'SUBSTITUTION' ? 'ON' : 'ASSIST'} />
                      <EventPlayerLink
                        player={event.relatedPlayer}
                        tournamentId={match.tournamentId}
                      >
                        {event.relatedPlayer.displayName}
                      </EventPlayerLink>
                    </>
                  ) : null}
                </span>
              </div>
              {['GOAL', 'OWN_GOAL', 'PENALTY_SCORED'].includes(event.type) ? (
                <div className="match-event__media">
                  {goalMedia.has(event.id) ? <GoalMedia asset={goalMedia.get(event.id)!} /> : null}
                  <MediaUploadButton purpose="GOAL_GIF" targetId={event.id} label="+ GIF" />
                </div>
              ) : null}
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
    <span className="match-event-player" data-match-resource="player">
      <PlayerTrigger playerId={player.id} tournamentId={tournamentId} name={player.displayName}>
        {children}
      </PlayerTrigger>
    </span>
  )
}
