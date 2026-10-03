import { useId } from 'react'

import type { TeamSummary } from '../../features/product/product.types'
import { getTeamNavPalette } from './team-nav-palette.h5'

import './team-nav-focus.h5.scss'

const contours = [
  {
    tone: 'inner',
    path: 'M100 71C80 69 65 57 56 43C50 33 42 27 30 27',
    width: 2.6,
    colors: ['primaryDark', 'primary', 'primaryLight'],
  },
  {
    tone: 'middle',
    path: 'M100 71C71 72 47 62 31 47C21 38 18 27 9 23',
    width: 1.9,
    colors: ['secondaryDark', 'secondary', 'secondaryLight'],
  },
  {
    tone: 'lower',
    path: 'M100 71C74 78 47 73 28 62C17 56 10 49 3 41',
    width: 1.8,
    colors: ['primaryDark', 'primary', 'primaryLight'],
  },
  {
    tone: 'outer',
    path: 'M100 71C72 82 42 78 19 66C10 61 4 55 1 48',
    width: 1,
    colors: ['secondaryDark', 'secondary', 'secondaryLight'],
  },
] as const

export function TeamNavFocus({ team }: { team?: TeamSummary | null }) {
  const id = useId().replace(/:/g, '')
  const palette = getTeamNavPalette(team)

  return (
    <span aria-hidden="true" className="public-team-focus">
      {contours.flatMap((layer, pair) =>
        [-1, 1].map((side) => {
          const gradientId = `${id}-${layer.tone}-${side}`
          return (
            <span
              className={`public-team-focus__wing public-team-focus__wing--${layer.tone}`}
              data-focus-side={side}
              data-focus-pair={pair}
              key={`${layer.tone}-${side}`}
            >
              <svg focusable="false" viewBox="0 0 200 80" preserveAspectRatio="none" fill="none">
                <defs>
                  <linearGradient
                    id={gradientId}
                    x1="100"
                    y1="71"
                    x2="14"
                    y2="32"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor={palette[layer.colors[0]]} />
                    <stop offset="0.5" stopColor={palette[layer.colors[1]]} />
                    <stop offset="1" stopColor={palette[layer.colors[2]]} />
                  </linearGradient>
                </defs>
                <g transform={side === 1 ? 'translate(200 0) scale(-1 1)' : undefined}>
                  <path
                    className="public-team-focus__trace"
                    d={layer.path}
                    stroke={palette[layer.colors[1]]}
                    strokeWidth={layer.width}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    className="public-team-focus__stroke"
                    d={layer.path}
                    stroke={`url(#${gradientId})`}
                    strokeWidth={layer.width}
                    pathLength="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              </svg>
            </span>
          )
        }),
      )}
      <span className="public-team-focus__jewel">
        <svg focusable="false" viewBox="0 0 200 80" preserveAspectRatio="none" fill="none">
          <path d="M100 65L105 71L100 77L95 71Z" fill={palette.secondary} />
          <path d="M100 65V77L95 71Z" fill={palette.primary} />
          <path d="M100 77V80" stroke={palette.secondary} strokeWidth="0.8" />
        </svg>
      </span>
    </span>
  )
}
