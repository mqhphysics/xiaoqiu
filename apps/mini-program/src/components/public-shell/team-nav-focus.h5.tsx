import { useId, useLayoutEffect, useRef, useState } from 'react'

import type { TeamSummary } from '../../features/product/product.types'
import { playTeamFocus } from './navigation-transition.h5'
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
        <span className="public-team-focus__seed" data-focus-key="seed" />
        <span
          className="public-team-focus__art public-team-focus__art--left"
          data-focus-key="left"
        />
        <span
          className="public-team-focus__art public-team-focus__art--right"
          data-focus-key="right"
        />
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
