import { useId, useLayoutEffect, useRef, useState } from 'react'

import type { TeamSummary } from '../../features/product/product.types'
import { playTeamFocus } from './navigation-transition.h5'
import { teamNavDesigns } from './team-nav-designs.h5'
import { getTeamNavOrnamentPalette } from './team-nav-palette.h5'
import { readTeamNavPreview, TeamNavPreviewControls } from './team-nav-preview.h5'

import './team-nav-focus.h5.scss'

const tones = {
  primary: ['primaryDark', 'primary', 'primaryLight'],
  secondary: ['secondaryDark', 'secondary', 'secondaryLight'],
  detail: ['secondary', 'primaryLight', 'secondaryLight'],
} as const

const previewTeams = {
  united: {
    teamCode: 'DEMO-PHY-1',
    crestUrl: '/api/media/demo/crests/01.png',
    primaryColor: null,
    secondaryColor: null,
  },
  city: {
    teamCode: 'DEMO-PHY-2',
    crestUrl: '/api/media/demo/crests/02.png',
    primaryColor: null,
    secondaryColor: null,
  },
} as const

export function TeamNavFocus({ team }: { team?: TeamSummary | null }) {
  const id = useId().replace(/:/g, '')
  const [preview, setPreview] = useState(readTeamNavPreview)
  const lastPreview = useRef(`${preview.design}:${preview.crest}`)
  const design = teamNavDesigns[preview.design]
  const palette = getTeamNavOrnamentPalette(preview.enabled ? previewTeams[preview.crest] : team)

  useLayoutEffect(() => {
    const key = `${preview.design}:${preview.crest}`
    if (lastPreview.current === key) return
    lastPreview.current = key
    if (!preview.enabled) return
    const element = document.getElementById(id)
    const shell = element?.closest<HTMLElement>('.public-app')
    if (shell?.querySelector('.public-team-nav--active')) playTeamFocus(shell, [])
  }, [id, preview.enabled, preview.design, preview.crest])

  const replay = () => {
    document
      .getElementById(id)
      ?.closest('.public-team-nav')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  return (
    <>
      <span
        aria-hidden="true"
        id={id}
        data-nav-design={design.key}
        className={`public-team-focus ${preview.enabled ? 'public-team-focus--preview' : ''}`}
      >
        {design.contours.flatMap((layer, pair) =>
          [-1, 1].map((side) => {
            const gradientId = `${id}-${design.key}-${layer.key}-${side}`
            const colors = tones[layer.tone]
            return (
              <span
                className={`public-team-focus__wing public-team-focus__wing--${layer.tone}`}
                data-focus-side={side}
                data-focus-pair={pair}
                data-focus-delay={layer.delay}
                data-focus-duration={layer.duration}
                key={`${design.key}-${layer.key}-${side}`}
              >
                <svg focusable="false" viewBox="0 0 200 80" preserveAspectRatio="none" fill="none">
                  <defs>
                    <linearGradient
                      id={gradientId}
                      x1="100"
                      y1={design.originY}
                      x2="14"
                      y2="32"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor={palette[colors[0]]} />
                      <stop offset="0.5" stopColor={palette[colors[1]]} />
                      <stop offset="1" stopColor={palette[colors[2]]} />
                    </linearGradient>
                  </defs>
                  <g transform={side === 1 ? 'translate(200 0) scale(-1 1)' : undefined}>
                    {layer.seedPath ? (
                      <path
                        className="public-team-focus__trace"
                        d={layer.seedPath}
                        stroke={palette[colors[1]]}
                        strokeWidth={layer.width}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
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
            {design.key === '04' ? (
              <path d="M100 57L104 61L100 65L96 61Z" stroke={palette.primary} strokeWidth="1.25" />
            ) : (
              <path d="M100 66L103 69L100 72L97 69Z" fill={palette.secondary} />
            )}
          </svg>
        </span>
        {preview.enabled ? (
          <img
            className="public-team-focus__sample-crest"
            src={previewTeams[preview.crest].crestUrl}
            alt=""
          />
        ) : null}
      </span>
      <TeamNavPreviewControls value={preview} onChange={setPreview} onReplay={replay} />
    </>
  )
}
