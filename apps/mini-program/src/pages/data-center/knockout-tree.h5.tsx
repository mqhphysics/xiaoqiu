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
import { matchWinnerId, knockoutRounds } from './knockout-display.logic'

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
                <path d="M10 14V19H26V22M40 14V19H26 M60 14V19H74V22M90 14V19H74 M26 36V40H50V44M74 36V40H50 M50 61V63H26V65M50 63H74V65 M26 79V82H25V83M74 79V82H75V83 M10 83V82H25M40 83V82H25M60 83V82H75M90 83V82H75" />
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
      <div className="data-desktop__knockout-foot">
        <span>{eightTeam ? '八强 → 半决赛 → 决赛' : '淘汰赛晋级路线'}</span>
        {expanded && thirdPlace && (
          <a href={matchDetailUrl(thirdPlace.id)} onClick={openMatch}>
            三四名赛 <span>{scoreLabel(thirdPlace)}</span> ↗
          </a>
        )}
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
          href={matchDetailUrl(match.id)}
          onClick={openMatch}
          aria-label={`${match.homeTeam?.name ?? match.homePlaceholder ?? '待定'} 对 ${match.awayTeam?.name ?? match.awayPlaceholder ?? '待定'}，${scoreLabel(match)}，查看比赛`}
        >
          <strong>{scoreLabel(match)}</strong>
          {expanded && (!winner || className.includes('--final')) && (
            <small>
              {className.includes('--final') ? '决赛 · ' : ''}
              {matchStatusLabel(match.status)}
            </small>
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
    >
      {team ? (
        <TeamCrest team={team} size="small" />
      ) : (
        <svg
          viewBox="0 0 32 36"
          className="data-desktop__empty-crest"
          fill="none"
          aria-label="席位待定"
        >
          <path
            d="M3 4 16 1l13 3v14c0 8-13 16-13 16S3 26 3 18Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M12 14h8M16 10v8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {expanded && (
        <TeamName team={team} tournamentId={tournamentId} fallback={placeholder ?? '席位待定'} />
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
