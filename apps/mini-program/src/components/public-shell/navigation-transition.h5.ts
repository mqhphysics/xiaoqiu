import type { NavigationSection } from './navigation-transition.types'

import './page-motion.h5.scss'

interface TeamFocusState extends Keyframe {
  transform: string
  opacity: string
  strokeDashoffset?: string
}

interface NavigationOrigin {
  target: NavigationSection
  direction: number
  capturedAt: number
  selection: DOMRect
  lineOpacity: string
  arcOpacity: string
  crest: DOMRect | null
  crestOpacity: string
  teamFocus: Record<string, TeamFocusState>
  animate: boolean
}

const sections: NavigationSection[] = ['home', 'schedule', 'team', 'data', 'me']
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'
const focusEasing = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
let origin: NavigationOrigin | null = null
const focusAnimations = new WeakMap<HTMLElement, Animation[]>()
const focusSelector = '.public-team-focus__stroke'

function readTeamFocus(element: Element): TeamFocusState {
  const style = getComputedStyle(element)
  return {
    transform: style.transform,
    opacity: style.opacity,
    strokeDashoffset: style.strokeDashoffset,
  }
}

function captureTeamFocus(shell: Element): Record<string, TeamFocusState> {
  return Object.fromEntries(
    Array.from(shell.querySelectorAll<Element>(focusSelector), (element) => [
      element.getAttribute('data-focus-key') ?? 'jewel',
      readTeamFocus(element),
    ]),
  )
}

function stopTeamFocus(shell: HTMLElement): void {
  focusAnimations.get(shell)?.forEach((animation) => animation.cancel())
  focusAnimations.delete(shell)
}

/**
 * Lightweight team-ornament entrance.
 *
 * History: the leaf-scroll used ~650 stroke-dashoffset WAAPI animations. After
 * `00e486f perf(h5): split the first load and keep visited tabs warm` (merged via
 * `bcbfe1f`), tab revisits kept pages mounted and the heavy draw either skipped
 * (focus-visible / stale origin) or painted as an instant CSS snap — stripes
 * appeared with no animation. Restore motion with a single opacity+transform
 * on the ornament group; strokes stay CSS-final when active.
 */
export function playTeamFocus(
  shell: HTMLElement,
  _initialFocus?: Record<string, TeamFocusState>,
): void {
  const button = shell.querySelector<HTMLElement>('.public-team-nav')
  stopTeamFocus(shell)
  if (
    !button?.classList.contains('public-team-nav--active') ||
    !window.matchMedia('(min-width: 721px)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return

  const animations: Animation[] = []
  const ornament = button.querySelector<HTMLElement>('.public-team-focus')
  if (ornament?.animate) {
    animations.push(
      ornament.animate(
        [
          { opacity: '0', transform: 'translateX(-50%) translateY(8px) scale(0.9)' },
          { opacity: '1', transform: 'translateX(-50%) translateY(0) scale(1)' },
        ],
        { duration: 460, easing: focusEasing, fill: 'backwards' },
      ),
    )
  }
  focusAnimations.set(shell, animations)
}

export function captureNavigationOrigin(shell: HTMLElement, target: NavigationSection): void {
  const selection = shell.querySelector<HTMLElement>('.public-nav__selection')
  const line = shell.querySelector<HTMLElement>('.public-nav__line')
  const arc = shell.querySelector<HTMLElement>('.public-nav__arc')
  if (!selection || !line || !arc || !window.matchMedia('(min-width: 721px)').matches) return
  const current = sections.find((section) =>
    shell.classList.contains(`public-app--section-${section}`),
  )
  const crest = shell.querySelector<HTMLElement>(
    '.public-team-nav > .team-crest, .public-team-nav__crest',
  )
  // Read the rendered position, including an interrupted animation, rather than a tab index.
  origin = {
    target,
    direction: Math.sign(sections.indexOf(target) - sections.indexOf(current ?? target)),
    capturedAt: Date.now(),
    selection: selection.getBoundingClientRect(),
    lineOpacity: getComputedStyle(line).opacity,
    arcOpacity: getComputedStyle(arc).opacity,
    crest: crest?.getBoundingClientRect() ?? null,
    crestOpacity: crest ? getComputedStyle(crest).opacity : '1',
    teamFocus: captureTeamFocus(shell),
    // Only skip motion for OS-level reduced-motion — do not treat an unrelated
    // :focus-visible (dialogs, fields) as a reason to snap the ornament in.
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

export function clearNavigationOrigin(): void {
  origin = null
}

export function animateNavigationEntrance(
  shell: HTMLElement,
  section: NavigationSection,
): () => void {
  // Taro H5 custom buttons need explicit keyboard focus and activation.
  const nav = shell.querySelector<HTMLElement>('.public-nav')
  nav?.querySelectorAll<HTMLElement>('.public-nav__item, .public-team-nav').forEach((button) => {
    button.setAttribute('role', 'button')
    button.tabIndex = 0
  })
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.key !== 'Enter' && event.key !== ' ')
    )
      return
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.public-nav__item, .public-team-nav')
        : null
    if (!button) return
    event.preventDefault()
    button.click()
  }
  nav?.addEventListener('keydown', onKeyDown)
  const removeKeyboardListener = () => {
    nav?.removeEventListener('keydown', onKeyDown)
    stopTeamFocus(shell)
  }
  const previous = origin
  origin = null

  // Always play the lightweight ornament entrance when landing on 主队, even if
  // the shared nav transition origin was dropped (tab-cache revisit / slow async).
  const playFocus = () => {
    if (section === 'team') playTeamFocus(shell, previous?.teamFocus)
  }

  if (
    !previous ||
    previous.target !== section ||
    Date.now() - previous.capturedAt > 2000 ||
    !previous.animate ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !window.matchMedia('(min-width: 721px)').matches
  ) {
    playFocus()
    return removeKeyboardListener
  }

  const animations: Animation[] = []
  playFocus()
  const animate = (element: Element | null, frames: Keyframe[], duration = 260) => {
    if (element?.animate) animations.push(element.animate(frames, { duration, easing }))
  }
  if (section !== 'team') {
    shell.querySelectorAll<SVGPathElement | HTMLElement>(focusSelector).forEach((element) => {
      const previousFocus = previous.teamFocus[element.getAttribute('data-focus-key') ?? 'jewel']
      if (!previousFocus) return
      animate(element, [previousFocus, readTeamFocus(element)], 420)
    })
  }
  const selection = shell.querySelector<HTMLElement>('.public-nav__selection')
  if (selection) {
    const target = selection.getBoundingClientRect()
    const transform = getComputedStyle(selection).transform
    animate(selection, [
      {
        transform: `translate(${previous.selection.left - target.left}px, ${previous.selection.top - target.top}px) ${transform}`,
      },
      { transform },
    ])
  }
  for (const [selector, opacity] of [
    ['.public-nav__line', previous.lineOpacity],
    ['.public-nav__arc', previous.arcOpacity],
  ] as const) {
    const element = shell.querySelector<HTMLElement>(selector)
    if (element) animate(element, [{ opacity }, { opacity: getComputedStyle(element).opacity }])
  }
  const crest = shell.querySelector<HTMLElement>(
    '.public-team-nav > .team-crest, .public-team-nav__crest',
  )
  if (crest && previous.crest) {
    const target = crest.getBoundingClientRect()
    if (target.width) {
      const style = getComputedStyle(crest)
      animate(crest, [
        {
          transform: `scale(${previous.crest.width / target.width}) ${style.transform === 'none' ? '' : style.transform}`,
          opacity: previous.crestOpacity,
        },
        { transform: style.transform, opacity: style.opacity },
      ])
    }
  }
  animate(
    shell.querySelector<HTMLElement>('.public-content'),
    [
      { transform: `translateX(${previous.direction * 16}px)`, opacity: 0.94 },
      { transform: 'none', opacity: 1 },
    ],
    210,
  )
  return () => {
    removeKeyboardListener()
    animations.forEach((animation) => animation.cancel())
  }
}
