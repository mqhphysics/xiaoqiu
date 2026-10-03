import { useId, useLayoutEffect, useRef, useState } from 'react'

import type { TeamSummary } from '../../features/product/product.types'
import { playTeamFocus } from './navigation-transition.h5'
import { goldLeafLines } from './team-nav-leaf-lines.h5'
import {
  readTeamNavPreview,
  teamNavPreviewCrests,
  TeamNavPreviewControls,
} from './team-nav-preview.h5'

import './team-nav-focus.h5.scss'

export function TeamNavFocus(_props: { team?: TeamSummary | null }) {
  const id = useId().replace(/:/g, '')
  const [preview, setPreview] = useState(readTeamNavPreview)
  const lastPreview = useRef(`${preview.design}:${preview.crest}`)

  useLayoutEffect(() => {
    const key = `${preview.design}:${preview.crest}`
    if (lastPreview.current === key) return
    lastPreview.current = key
    if (!preview.enabled) return
    const element = document.getElementById(id)
    const shell = element?.closest<HTMLElement>('.public-app')
    if (shell?.querySelector('.public-team-nav--active')) playTeamFocus(shell, {})
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
        data-nav-design="15"
        className={`public-team-focus ${preview.enabled ? 'public-team-focus--preview' : ''}`}
      >
        <svg
          className="public-team-focus__drawing"
          viewBox="0 0 200 84"
          preserveAspectRatio="none"
          fill="none"
          focusable="false"
        >
          {[-1, 1].map((side) => (
            <g key={side} transform={side === 1 ? 'translate(200 0) scale(-1 1)' : undefined}>
              {goldLeafLines.map((line) => (
                <g
                  key={line.key}
                  className="public-team-focus__line"
                  data-focus-delay={line.delay}
                  data-focus-duration={line.duration}
                  data-focus-region={line.region}
                >
                  {line.seedPath ? (
                    <path
                      className="public-team-focus__trace"
                      d={line.seedPath}
                      strokeWidth={line.width}
                    />
                  ) : null}
                  <path
                    className="public-team-focus__stroke"
                    data-focus-key={`${line.key}-${side}`}
                    d={line.path}
                    strokeWidth={line.width}
                    strokeLinecap={
                      line.region === 'stem' || line.key.startsWith('bud-') ? 'round' : 'butt'
                    }
                    pathLength="1"
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
        {preview.enabled ? (
          <img
            className="public-team-focus__sample-crest"
            src={teamNavPreviewCrests[preview.crest].crestUrl}
            alt=""
          />
        ) : null}
      </span>
      <TeamNavPreviewControls value={preview} onChange={setPreview} onReplay={replay} />
    </>
  )
}
