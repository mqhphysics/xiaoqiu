import './team-nav-focus.h5.scss'

const contours = [
  { side: -1, tone: 'primary', path: 'M52 7C37 12 30 22 30 35C30 47 37 58 49 63' },
  { side: 1, tone: 'primary', path: 'M80 7C95 12 102 22 102 35C102 47 95 58 83 63' },
  { side: -1, tone: 'outer', path: 'M46 3C26 13 19 31 25 48' },
  { side: 1, tone: 'outer', path: 'M86 3C106 13 113 31 107 48' },
  { side: -1, tone: 'base', path: 'M37 63C45 70 55 74 63 74' },
  { side: 1, tone: 'base', path: 'M95 63C87 70 77 74 69 74' },
] as const

export function TeamNavFocus() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="public-team-focus"
      viewBox="0 0 132 76"
      width="132"
      height="76"
      fill="none"
    >
      {contours.map((contour, index) => (
        <g
          className={`public-team-focus__wing public-team-focus__wing--${contour.tone}`}
          data-focus-side={contour.side}
          data-focus-pair={Math.floor(index / 2)}
          key={`${contour.tone}-${contour.side}`}
        >
          <path
            className="public-team-focus__stroke"
            d={contour.path}
            pathLength="1"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  )
}
