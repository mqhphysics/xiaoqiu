import { createPortal } from 'react-dom'

import type { TeamNavDesignKey } from './team-nav-designs.h5'

export interface TeamNavPreviewState {
  enabled: boolean
  design: TeamNavDesignKey
  crest: 'united' | 'city'
}

export function readTeamNavPreview(): TeamNavPreviewState {
  const params = new URLSearchParams(window.location.search)
  const design = params.get('navDesign')
  return {
    enabled:
      window.location.hostname === '127.0.0.1' &&
      window.location.port === '3101' &&
      (design === '04' || design === '15'),
    design: design === '15' ? '15' : '04',
    crest: params.get('navCrest') === 'city' ? 'city' : 'united',
  }
}

export function TeamNavPreviewControls({
  value,
  onChange,
  onReplay,
}: {
  value: TeamNavPreviewState
  onChange: (value: TeamNavPreviewState) => void
  onReplay: () => void
}) {
  if (!value.enabled) return null
  const update = (next: TeamNavPreviewState) => {
    const url = new URL(window.location.href)
    url.searchParams.set('navDesign', next.design)
    url.searchParams.set('navCrest', next.crest)
    window.history.replaceState(window.history.state, '', url)
    onChange(next)
  }
  return createPortal(
    <div
      className="team-nav-preview"
      aria-label="队徽图案对比"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="team-nav-preview__title">队徽图案对比</div>
      <div className="team-nav-preview__choices" aria-label="图案版本">
        <button
          type="button"
          aria-pressed={value.design === '04'}
          onClick={() => update({ ...value, design: '04' })}
        >
          04 · 菱形卷线
        </button>
        <button
          type="button"
          aria-pressed={value.design === '15'}
          onClick={() => update({ ...value, design: '15' })}
        >
          15 · 卷草细纹
        </button>
      </div>
      <div className="team-nav-preview__choices" aria-label="示例队徽">
        <button
          type="button"
          aria-pressed={value.crest === 'united'}
          onClick={() => update({ ...value, crest: 'united' })}
        >
          曼联
        </button>
        <button
          type="button"
          aria-pressed={value.crest === 'city'}
          onClick={() => update({ ...value, crest: 'city' })}
        >
          曼城
        </button>
        <button type="button" onClick={onReplay}>
          播放生长
        </button>
      </div>
      <div className="team-nav-preview__note">队徽为对比试样，不改变账号主队</div>
    </div>,
    document.body,
  )
}
