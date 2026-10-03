import type { NavigationSection } from './navigation-transition.types'

interface TeamFocusState extends Keyframe {
  transform: string
  opacity: string
  strokeDashoffset?: string
  clipPath?: string
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
const focusSelector =
  '.public-team-focus__stroke, .public-team-focus__body, .public-team-focus__engraving, .public-team-focus__jewel'

function readTeamFocus(element: Element): TeamFocusState {
  const style = getComputedStyle(element)
  return {
    transform: style.transform,
    opacity: style.opacity,
    ...(element.matches('.public-team-focus__stroke, .public-team-focus__engraving')
      ? { strokeDashoffset: style.strokeDashoffset }
      : {}),
    ...(element.matches('.public-team-focus__body') ? { clipPath: style.clipPath } : {}),
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

export function playTeamFocus(
  shell: HTMLElement,
  initialFocus?: Record<string, TeamFocusState>,
): void {
  const button = shell.querySelector<HTMLElement>('.public-team-nav')
  const replayFocus = initialFocus ? {} : captureTeamFocus(button ?? shell)
  stopTeamFocus(shell)
  if (
    !window.matchMedia('(min-width: 721px)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.activeElement?.matches(':focus-visible')
  )
    return
  if (!button?.classList.contains('public-team-nav--active')) return
  const animations: Animation[] = []
  const wings = button.querySelectorAll<HTMLElement>('.public-team-focus__wing')
  for (const wing of wings) {
    const stroke = wing.querySelector<SVGPathElement>('.public-team-focus__stroke')
    if (!stroke) continue
    const seed = wing.querySelector<SVGPathElement>('.public-team-focus__trace')
    const seedFraction = seed ? Math.min(1, seed.getTotalLength() / stroke.getTotalLength()) : 0
    const opacity = wing.classList.contains('public-team-focus__wing--detail') ? '0.64' : '0.92'
    const options: KeyframeAnimationOptions = {
      duration: Number(wing.dataset.focusDuration) || 1050,
      delay: Number(wing.dataset.focusDelay) || 0,
      easing: focusEasing,
      fill: 'backwards',
    }
    const start: Keyframe = {
      strokeDashoffset: String(1 - seedFraction),
      opacity: seed ? '0.4' : '0',
    }
    const key = stroke.getAttribute('data-focus-key') ?? ''
    const previous = initialFocus?.[key]
    const frames: Keyframe[] = initialFocus
      ? [previous && parseFloat(previous.opacity) > 0.01 ? previous : start]
      : [replayFocus[key] ?? { strokeDashoffset: '0', opacity: '1' }, { ...start, offset: 0.12 }]
    frames.push(
      { strokeDashoffset: '0.2', opacity, offset: 0.68 },
      { strokeDashoffset: '0', opacity },
    )
    animations.push(stroke.animate(frames, options))

    const body = wing.querySelector<SVGPathElement>('.public-team-focus__body')
    if (body) {
      const bodyKey = body.getAttribute('data-focus-key') ?? ''
      const hidden: Keyframe = { opacity: 0, clipPath: 'inset(0 0 100% 0) fill-box' }
      const visible: Keyframe = { opacity: 0.34, clipPath: 'inset(0 0 0 0) fill-box' }
      const bodyPrevious = initialFocus?.[bodyKey]
      const bodyFrames: Keyframe[] = initialFocus
        ? [bodyPrevious && parseFloat(bodyPrevious.opacity) > 0.01 ? bodyPrevious : hidden]
        : [replayFocus[bodyKey] ?? visible, { ...hidden, offset: 0.12 }]
      bodyFrames.push(visible)
      animations.push(
        body.animate(bodyFrames, {
          duration: 600,
          delay: Number(options.delay) + 200,
          easing: focusEasing,
          fill: 'backwards',
        }),
      )
    }

    wing
      .querySelectorAll<SVGPathElement>('.public-team-focus__engraving')
      .forEach((grain, index) => {
        const grainKey = grain.getAttribute('data-focus-key') ?? ''
        const hidden: Keyframe = { opacity: 0, strokeDashoffset: '1' }
        const visible: Keyframe = { opacity: 0.58, strokeDashoffset: '0' }
        const grainPrevious = initialFocus?.[grainKey]
        const grainFrames: Keyframe[] = initialFocus
          ? [grainPrevious && parseFloat(grainPrevious.opacity) > 0.01 ? grainPrevious : hidden]
          : [replayFocus[grainKey] ?? visible, { ...hidden, offset: 0.12 }]
        grainFrames.push(visible)
        animations.push(
          grain.animate(grainFrames, {
            duration: 500,
            delay: Number(options.delay) + Number(options.duration) - 680 + index * 12,
            easing: focusEasing,
            fill: 'backwards',
          }),
        )
      })
  }
  const jewel = button.querySelector<HTMLElement>('.public-team-focus__jewel')
  if (jewel)
    animations.push(
      jewel.animate(
        [
          initialFocus?.jewel ??
            replayFocus.jewel ?? {
              transform: 'scale(0.85)',
              opacity: '0.3',
            },
          { transform: 'scale(1.18)', opacity: 1, offset: 0.55 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 300, easing: focusEasing, fill: 'backwards' },
      ),
    )
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
    animate:
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !document.activeElement?.matches(':focus-visible'),
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
  if (
    !previous ||
    previous.target !== section ||
    Date.now() - previous.capturedAt > 2000 ||
    !previous.animate ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !window.matchMedia('(min-width: 721px)').matches
  )
    return removeKeyboardListener

  const animations: Animation[] = []
  if (section === 'team') playTeamFocus(shell, previous.teamFocus)
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
