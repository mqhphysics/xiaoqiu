import Taro from '@tarojs/taro'
import { TeamCrest, TeamName } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { matchStatusLabel } from '../../features/product/product.format'
import { matchDetailUrl } from '../../features/competition/competition.logic'
import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import { knockoutMatchTime, matchWinnerId, knockoutRounds } from './knockout-display.logic'

type Props = {
  data: CompetitionDataResponse & { resultsMode?: string }
  expanded: boolean
  onExpand: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function KnockoutPanel({ data, expanded, onExpand }: Props) {
  const { rounds, thirdPlace, eightTeam } = knockoutRounds(data)
  return (
    <section
      className={
        'data-desktop__card data-desktop__panel data-desktop__knockout-panel ' +
        (expanded ? 'is-expanded' : 'is-collapsed')
      }
      aria-label="淘汰赛面板"
    >
      <div className="data-desktop__card-head">
        <button
          type="button"
          className="data-desktop__panel-toggle"
          aria-expanded={expanded}
          aria-controls="data-knockout-content"
          onClick={onExpand}
        >
          <h2>淘汰赛</h2>
          <span aria-hidden="true">{expanded ? '完整对阵' : '展开 ↗'}</span>
        </button>
        <span className="data-desktop__knockout-caption">
          {eightTeam ? '八强晋级图' : '晋级图'}
        </span>
      </div>
      <div id="data-knockout-content">
        {rounds.length === 0 ? (
          <DataState kind="empty" title="暂无淘汰赛对阵" description="对阵确认后将在这里显示。" />
        ) : eightTeam ? (
          <div className="data-desktop__knockout-map" aria-label="八强、半决赛和决赛晋级图">
            <svg
              className="data-desktop__knockout-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g fill="none" stroke="currentColor" strokeWidth="0.45">
                <g data-branch="q0">
                  <polyline points="10,14 10,19 25,19 25,22" />
                  <polyline points="40,14 40,19 25,19" />
                </g>
                <g data-branch="q1">
                  <polyline points="60,14 60,19 75,19 75,22" />
                  <polyline points="90,14 90,19 75,19" />
                </g>
                <g data-branch="s0">
                  <polyline points="25,36 25,40 50,40 50,44" />
                  <polyline points="75,36 75,40 50,40" />
                </g>
                <g data-branch="s1">
                  <polyline points="50,61 50,63 25,63 25,65" />
                  <polyline points="50,63 75,63 75,65" />
                </g>
                <g data-branch="q2">
                  <polyline points="25,79 25,82 10,82 10,83" />
                  <polyline points="25,82 40,82 40,83" />
                </g>
                <g data-branch="q3">
                  <polyline points="75,79 75,82 60,82 60,83" />
                  <polyline points="75,82 90,82 90,83" />
                </g>
              </g>
            </svg>
            {rounds[0]!.matches.map((match, index) => (
              <TreeMatch
                key={match.id}
                match={match}
                expanded={expanded}
                className={`data-desktop__tree-match--quarter data-desktop__tree-match--q${index}`}
              />
            ))}
            {rounds[1]!.matches.map((match, index) => (
              <TreeMatch
                key={match.id}
                match={match}
                expanded={expanded}
                className={`data-desktop__tree-match--semi data-desktop__tree-match--s${index}`}
              />
            ))}
            <TreeMatch
              match={rounds[2]!.matches[0]!}
              expanded={expanded}
              className="data-desktop__tree-match--final"
            />
          </div>
        ) : (
          <div className="data-desktop__knockout-rounds">
            {rounds.map((round) => (
              <div className="data-desktop__knockout-round" key={round.id}>
                <h3>{round.name}</h3>
                {round.matches.map((match) => (
                  <TreeMatch key={match.id} match={match} expanded={expanded} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {thirdPlace && (
        <section className="data-desktop__third-place" aria-label="季军赛">
          <h3>季军赛</h3>
          <TreeMatch
            match={thirdPlace}
            expanded={expanded}
            className="data-desktop__tree-match--third"
          />
        </section>
      )}
      <div className="data-desktop__knockout-foot">
        <span>{eightTeam ? '八强 → 半决赛 → 决赛' : '淘汰赛晋级路线'}</span>
        {data.resultsMode === 'DEMO' && <span>演示赛季 · 对阵来自比赛记录</span>}
      </div>
      {!expanded && (
        <button
          type="button"
          className="data-desktop__panel-cover"
          aria-label="展开淘汰赛"
          onClick={onExpand}
        >
          <span className="sr-only">展开淘汰赛</span>
        </button>
      )}
    </section>
  )
}

function TreeMatch({
  match,
  expanded,
  className = '',
}: {
  match: MatchSummary
  expanded: boolean
  className?: string
}) {
  const winner = matchWinnerId(match)
  return (
    <div className={'data-desktop__tree-match ' + className} data-match-id={match.id}>
      <div className="data-desktop__tree-pair">
        <TreeTeam
          team={match.homeTeam}
          placeholder={match.homePlaceholder}
          winner={winner}
          expanded={expanded}
          tournamentId={match.tournamentId}
        />
        <a
          className="data-desktop__tree-score"
          tabIndex={expanded ? 0 : -1}
          href={matchDetailUrl(match.id)}
          onClick={openMatch}
          aria-label={`${match.homeTeam?.name ?? match.homePlaceholder ?? '待定'} 对 ${match.awayTeam?.name ?? match.awayPlaceholder ?? '待定'}，${scoreLabel(match)}，查看比赛`}
        >
          <strong>{scoreLabel(match)}</strong>
          <time className="data-desktop__tree-date" dateTime={match.scheduledStartAt ?? undefined}>
            {knockoutMatchTime(match.scheduledStartAt, !expanded)}
          </time>
          {expanded && !['FINISHED', 'CONFIRMED', 'SCHEDULED'].includes(match.status) && (
            <small>{matchStatusLabel(match.status)}</small>
          )}
        </a>
        <TreeTeam
          team={match.awayTeam}
          placeholder={match.awayPlaceholder}
          winner={winner}
          expanded={expanded}
          tournamentId={match.tournamentId}
        />
      </div>
      {expanded && match.homePenaltyScore !== null && match.awayPenaltyScore !== null && (
        <span className="data-desktop__tree-penalties">
          点球 {match.homePenaltyScore}–{match.awayPenaltyScore}
        </span>
      )}
    </div>
  )
}

function TreeTeam({
  team,
  placeholder,
  winner,
  expanded,
  tournamentId,
}: {
  team: TeamSummary | null
  placeholder?: string | null | undefined
  winner: string | null
  expanded: boolean
  tournamentId: string
}) {
  return (
    <div
      className={
        'data-desktop__tree-team ' + (winner && team?.id !== winner ? 'is-eliminated' : '')
      }
      title={team?.name ?? placeholder ?? '席位待定'}
      data-team-id={team?.id ?? 'pending'}
      data-team-code={team?.teamCode ?? ''}
      data-team-tournament={tournamentId}
    >
      <div className="data-desktop__tree-badge">
        {team ? (
          <TeamCrest team={team} size="small" interactive={expanded} />
        ) : (
          <svg
            viewBox="0 0 64 64"
            className="data-desktop__empty-crest"
            role="img"
            aria-label="待定球队队徽"
          >
            <circle cx="32" cy="32" r="29" fill="#edf2e8" stroke="#b5c4ac" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="23.5" fill="#f8faf4" stroke="#cad5c3" />
            <path
              d="M25.5 24.5a6.5 6.5 0 0 1 13 0c0 4.5-6.5 5.5-6.5 10"
              fill="none"
              stroke="#7a9070"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="32" cy="41.5" r="2" fill="#7a9070" />
          </svg>
        )}
      </div>
      {expanded && (
        <div className="data-desktop__tree-name">
          <TeamName
            team={team}
            tournamentId={tournamentId}
            className="data-desktop__tree-team-label"
            fallback={placeholder ?? '席位待定'}
          />
        </div>
      )}
    </div>
  )
}

function scoreLabel(match: MatchSummary) {
  return match.homeScore === null || match.awayScore === null
    ? 'VS'
    : `${match.homeScore} – ${match.awayScore}`
}

function openMatch(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  void Taro.navigateTo({ url: event.currentTarget.getAttribute('href') ?? '' })
}
