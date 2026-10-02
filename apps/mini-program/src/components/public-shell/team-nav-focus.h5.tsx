import { useId } from 'react'

import './team-nav-focus.h5.scss'

const layers = [
  {
    tone: 'outer',
    path: 'M7 37C20 57 39 64 63 65C37 70 14 57 7 37Z',
    edge: 'M7 37C20 57 39 64 63 65',
    colors: ['#fbf8ed', '#dfd1a6', '#9eaa87'],
  },
  {
    tone: 'middle',
    path: 'M20 34C29 48 44 58 63 63C39 65 23 55 20 34Z',
    edge: 'M20 34C29 48 44 58 63 63',
    colors: ['#fffaf0', '#c9bd92', '#708c71'],
  },
  {
    tone: 'base',
    path: 'M33 43C39 55 49 61 63 63C45 65 34 56 33 43Z',
    edge: 'M33 43C39 55 49 61 63 63',
    colors: ['#d8dfcb', '#718e75', '#244f3c'],
  },
] as const

export function TeamNavFocus() {
  const id = useId().replace(/:/g, '')

  return (
    <span aria-hidden="true" className="public-team-focus">
      {layers.flatMap((layer, pair) =>
        [-1, 1].map((side) => {
          const gradientId = `${id}-${layer.tone}-${side}`
          return (
            <span
              className={`public-team-focus__wing public-team-focus__wing--${layer.tone}`}
              data-focus-side={side}
              data-focus-pair={pair}
              key={`${layer.tone}-${side}`}
            >
              <svg focusable="false" viewBox="0 0 132 76" fill="none">
                <defs>
                  <linearGradient
                    id={gradientId}
                    x1="14"
                    y1="43"
                    x2="62"
                    y2="67"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor={layer.colors[0]} />
                    <stop offset="0.48" stopColor={layer.colors[1]} />
                    <stop offset="1" stopColor={layer.colors[2]} />
                  </linearGradient>
                </defs>
                <g transform={side === 1 ? 'translate(132 0) scale(-1 1)' : undefined}>
                  <path d={layer.path} fill={`url(#${gradientId})`} />
                  <path d={layer.edge} stroke="#f8f4e5" strokeWidth="0.55" />
                </g>
              </svg>
            </span>
          )
        }),
      )}
      <span className="public-team-focus__jewel">
        <svg focusable="false" viewBox="0 0 132 76" fill="none">
          <path d="M66 64L69.5 68L66 72L62.5 68Z" fill="#bb9d57" />
          <path d="M66 64L66 72L62.5 68Z" fill="#52705a" />
          <path d="M66 73V76" stroke="#c6ad70" strokeWidth="0.65" />
        </svg>
      </span>
    </span>
  )
}
