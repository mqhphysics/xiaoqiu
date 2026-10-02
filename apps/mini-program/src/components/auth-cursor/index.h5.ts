import arrowUrl from '../../assets/login-art/cursors/default-32.png'
import ballUrl from '../../assets/login-art/cursors/football-28.svg'
import handUrl from '../../assets/login-art/cursors/hand-32.svg'
import textUrl from '../../assets/login-art/cursors/text-32.svg'
import disabledUrl from '../../assets/login-art/cursors/disabled-32.svg'
import busyUrl from '../../assets/login-art/cursors/busy-32.svg'
import progressUrl from '../../assets/login-art/cursors/progress-32.svg'
import moveUrl from '../../assets/login-art/cursors/move-32.svg'
import grabUrl from '../../assets/login-art/cursors/grab-32.svg'
import grabbingUrl from '../../assets/login-art/cursors/grabbing-32.svg'
import precisionUrl from '../../assets/login-art/cursors/precision-32.svg'
import resizeEwUrl from '../../assets/login-art/cursors/resize-ew-32.svg'
import resizeNsUrl from '../../assets/login-art/cursors/resize-ns-32.svg'
import resizeNwseUrl from '../../assets/login-art/cursors/resize-nwse-32.svg'
import resizeNeswUrl from '../../assets/login-art/cursors/resize-nesw-32.svg'
import helpUrl from '../../assets/login-art/cursors/help-32.svg'
import zoomInUrl from '../../assets/login-art/cursors/zoom-in-32.svg'
import zoomOutUrl from '../../assets/login-art/cursors/zoom-out-32.svg'
import { cursorMorphPath } from './morph.h5'

const skins = {
  default: { url: arrowUrl, hotspot: '2 2', fallback: 'default' },
  football: { url: ballUrl, hotspot: '14 14', fallback: 'default' },
  hand: { url: handUrl, hotspot: '12 4', fallback: 'pointer' },
  text: { url: textUrl, hotspot: '16 16', fallback: 'text' },
  disabled: { url: disabledUrl, hotspot: '16 16', fallback: 'not-allowed' },
  busy: { url: busyUrl, hotspot: '16 16', fallback: 'wait' },
  progress: { url: progressUrl, hotspot: '2 2', fallback: 'progress' },
  move: { url: moveUrl, hotspot: '16 16', fallback: 'move' },
  grab: { url: grabUrl, hotspot: '16 16', fallback: 'grab' },
  grabbing: { url: grabbingUrl, hotspot: '16 16', fallback: 'grabbing' },
  precision: { url: precisionUrl, hotspot: '16 16', fallback: 'crosshair' },
  'resize-ew': { url: resizeEwUrl, hotspot: '16 16', fallback: 'ew-resize' },
  'resize-ns': { url: resizeNsUrl, hotspot: '16 16', fallback: 'ns-resize' },
  'resize-nwse': { url: resizeNwseUrl, hotspot: '16 16', fallback: 'nwse-resize' },
  'resize-nesw': { url: resizeNeswUrl, hotspot: '16 16', fallback: 'nesw-resize' },
  help: { url: helpUrl, hotspot: '2 2', fallback: 'help' },
  'zoom-in': { url: zoomInUrl, hotspot: '13 13', fallback: 'zoom-in' },
  'zoom-out': { url: zoomOutUrl, hotspot: '13 13', fallback: 'zoom-out' },
} as const
type Skin = keyof typeof skins | null
const nativeSkins: Record<string, Exclude<Skin, null>> = {
  'not-allowed': 'disabled',
  'no-drop': 'disabled',
  wait: 'busy',
  progress: 'progress',
  move: 'move',
  'all-scroll': 'move',
  grab: 'grab',
  grabbing: 'grabbing',
  crosshair: 'precision',
  'ew-resize': 'resize-ew',
  'e-resize': 'resize-ew',
  'w-resize': 'resize-ew',
  'col-resize': 'resize-ew',
  'ns-resize': 'resize-ns',
  'n-resize': 'resize-ns',
  's-resize': 'resize-ns',
  'row-resize': 'resize-ns',
  'nwse-resize': 'resize-nwse',
  'nw-resize': 'resize-nwse',
  'se-resize': 'resize-nwse',
  'nesw-resize': 'resize-nesw',
  'ne-resize': 'resize-nesw',
  'sw-resize': 'resize-nesw',
  help: 'help',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
}
type Zone = 'art' | 'form' | null
const ATTRIBUTE = 'data-xq-cursor'
const DURATION = 280

/** App-wide native cursors; a DOM cursor exists only for the brief login morph. */
export function mountCursorSkin(): () => void {
  const root = document.documentElement
  const precisePointer = window.matchMedia(
    '(min-width: 1024px) and (hover: hover) and (pointer: fine)',
  )
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const style = document.createElement('style')
  style.dataset.xqCursorStyles = ''
  // Raw H5 CSS keeps native element names out of Taro's stylesheet transform.
  style.textContent = `
    html.xq-cursor-skin { cursor: url("${arrowUrl}") 2 2, default; }
    ${Object.entries(skins)
      .map(
        ([name, skin]) =>
          `html.xq-cursor-skin [${ATTRIBUTE}="${name}"] { cursor: url("${skin.url}") ${skin.hotspot}, ${skin.fallback} !important; }`,
      )
      .join('\n')}
    html.xq-cursor-skin :disabled { cursor: url("${disabledUrl}") 16 16, not-allowed !important; }
    html.xq-cursor-skin.xq-cursor-morphing,
    html.xq-cursor-skin.xq-cursor-morphing * { cursor: none !important; }
    #xq-cursor-morph { position: fixed; left: 0; top: 0; width: 72px; height: 72px;
      margin: 0; padding: 0; pointer-events: none; z-index: 2147483647; display: none; }
    #xq-cursor-morph svg { display: block; width: 72px; height: 72px; overflow: visible; }
  `
  document.head.append(style)
  const overlay = document.createElement('div')
  overlay.id = 'xq-cursor-morph'
  overlay.setAttribute('aria-hidden', 'true')
  // Static internal SVG; no user content is interpolated here.
  overlay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 72 72">
    <path data-outline fill="#e4ede5" stroke="#173f35" stroke-linecap="round" stroke-linejoin="round"/>
    <path data-fold d="M4.3 21.7 8.3 18.7 8.3 26.5Z" fill="#ce7e6b"/>
    <g data-seams fill="none" stroke="#173f35" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0-4.3 4.05-1.35 2.5 3.3h-5l-1.55-4.65Z"/>
      <path d="M0-4.3v-6.2m4.05 9.15 5.55-1.85m-7.1 6.5 3.7 5.2m-8.7-5.2-3.7 5.2m2.15-9.85L-9.6-3.2"/>
    </g></svg>`
  document.body.append(overlay)
  const outline = overlay.querySelector<SVGPathElement>('[data-outline]')!
  const fold = overlay.querySelector<SVGPathElement>('[data-fold]')!
  const seams = overlay.querySelector<SVGGElement>('[data-seams]')!
  let target: Element | null = null
  let zone: Zone = null
  let amount = 0
  let frame = 0
  let startTime = 0
  let from = 0
  let goal = 0
  let duration = DURATION
  let refreshFrame = 0
  let pointerX = 0
  let pointerY = 0

  function finishMorph() {
    window.cancelAnimationFrame(frame)
    frame = 0
    overlay.style.display = 'none'
    root.classList.remove('xq-cursor-morphing')
  }

  function clearHover() {
    window.cancelAnimationFrame(refreshFrame)
    refreshFrame = 0
    target?.removeAttribute(ATTRIBUTE)
    target = null
    zone = null
    finishMorph()
  }

  function paint(value: number) {
    amount = value
    outline.setAttribute('d', cursorMorphPath(value))
    outline.setAttribute('stroke-width', String(2.4 - value * 1.3))
    outline.setAttribute('fill-opacity', String(1 - value))
    fold.setAttribute('opacity', String(Math.max(0, 1 - value * 2)))
    seams.setAttribute('opacity', String(Math.max(0, (value - 0.2) / 0.8)))
    overlay.dataset.progress = value.toFixed(3)
  }

  function position(x: number, y: number) {
    // SVG origin is the true click point: arrow tip or football center.
    overlay.style.transform = `translate3d(${x - 30}px,${y - 30}px,0)`
  }

  function animate(now: number) {
    const t = Math.min(1, (now - startTime) / duration)
    const eased = t * t * (3 - 2 * t)
    paint(from + (goal - from) * eased)
    if (t < 1) frame = window.requestAnimationFrame(animate)
    else finishMorph()
  }

  function morph(next: number, x: number, y: number) {
    const continuing = frame !== 0
    window.cancelAnimationFrame(frame)
    from = continuing ? amount : 1 - next
    goal = next
    duration = Math.max(100, DURATION * Math.abs(goal - from))
    startTime = performance.now()
    position(x, y)
    paint(from)
    overlay.style.display = 'block'
    root.classList.add('xq-cursor-morphing')
    overlay.dataset.direction = next === 1 ? 'arrow-to-football' : 'football-to-arrow'
    frame = window.requestAnimationFrame(animate)
  }

  function classify(element: Element): Skin {
    if (element.closest(':disabled, [disabled], [aria-disabled="true"], .weui-btn_disabled'))
      return 'disabled'
    if (element.closest('.art-login__left')) return 'football'
    const cursor = window.getComputedStyle(element).cursor
    if (nativeSkins[cursor]) return nativeSkins[cursor]
    if (
      ![
        'auto',
        'default',
        'inherit',
        'initial',
        'unset',
        'pointer',
        'text',
        'vertical-text',
      ].includes(cursor) &&
      !cursor.includes('url(')
    )
      return null
    if (element.closest('[aria-busy="true"]')) return 'progress'
    if (
      element.closest(
        'input[type="file"], input[type="checkbox"], input[type="radio"], input[type="color"], input[type="button"], input[type="submit"], input[type="reset"]',
      )
    )
      return 'hand'
    if (element.closest('input, textarea, [contenteditable="true"], .weui-input, .weui-textarea'))
      return 'text'
    if (element.closest('button, a[href], select, [role="button"], taro-button-core')) return 'hand'
    if (cursor === 'pointer') return 'hand'
    if (cursor === 'text' || cursor === 'vertical-text') return 'text'
    if (cursor === 'not-allowed') return 'disabled'
    return 'default'
  }

  function hover(event: PointerEvent) {
    if (
      !precisePointer.matches ||
      event.pointerType !== 'mouse' ||
      !(event.target instanceof Element)
    )
      return
    pointerX = event.clientX
    pointerY = event.clientY
    applyHover(event.target)
  }

  function applyHover(element: Element, force = false) {
    if (target === element && !force) return
    target?.removeAttribute(ATTRIBUTE)
    // Inspect existing CSS before applying the skin; clickable Taro Views keep
    // their pointer semantics without changing every page or modal component.
    // The temporary cursor:none must not hide the underlying semantic cursor
    // when the pointer enters another element during the same morph.
    const morphing = root.classList.contains('xq-cursor-morphing')
    if (morphing) root.classList.remove('xq-cursor-morphing')
    const skin = classify(element)
    if (morphing) root.classList.add('xq-cursor-morphing')
    target = element
    if (skin) element.setAttribute(ATTRIBUTE, skin)
    const nextZone: Zone = element.closest('.art-login__left')
      ? 'art'
      : element.closest('.art-login__panel')
        ? 'form'
        : null
    const crossing = zone !== null && nextZone !== null && zone !== nextZone
    if (crossing && (skin === 'default' || skin === 'football') && !reducedMotion.matches) {
      morph(nextZone === 'art' ? 1 : 0, pointerX, pointerY)
    } else if (nextZone === null || (skin !== 'default' && skin !== 'football')) {
      finishMorph()
    }
    zone = nextZone
  }

  function move(event: PointerEvent) {
    hover(event)
    if (frame) position(event.clientX, event.clientY)
  }

  function leave(event: PointerEvent) {
    if (event.relatedTarget === null) clearHover()
  }

  function visibility() {
    if (document.hidden) clearHover()
  }

  function syncPointer() {
    clearHover()
    root.classList.toggle('xq-cursor-skin', precisePointer.matches)
  }

  function refreshAfterInteraction(event: PointerEvent) {
    if (!precisePointer.matches || event.pointerType !== 'mouse') return
    window.cancelAnimationFrame(refreshFrame)
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = 0
      if (target?.isConnected) applyHover(target, true)
    })
  }
  // A hovered button can become disabled or busy without pointer movement.
  const semanticObserver = new MutationObserver((records) => {
    if (!target || !precisePointer.matches) return
    if (!target.isConnected) {
      clearHover()
      return
    }
    if (
      records.some(
        (record) =>
          record.target instanceof Element &&
          record.target !== root &&
          record.target.contains(target),
      )
    )
      applyHover(target, true)
  })
  semanticObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class', 'style'],
  })

  precisePointer.addEventListener('change', syncPointer)
  reducedMotion.addEventListener('change', finishMorph)
  document.addEventListener('pointerover', hover, true)
  document.addEventListener('pointermove', move, true)
  document.addEventListener('pointerout', leave, true)
  document.addEventListener('pointerdown', refreshAfterInteraction, true)
  document.addEventListener('pointerup', refreshAfterInteraction, true)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('blur', clearHover)
  window.addEventListener('hashchange', clearHover)
  window.addEventListener('scroll', clearHover, true)
  syncPointer()

  return () => {
    clearHover()
    root.classList.remove('xq-cursor-skin')
    precisePointer.removeEventListener('change', syncPointer)
    reducedMotion.removeEventListener('change', finishMorph)
    document.removeEventListener('pointerover', hover, true)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerout', leave, true)
    document.removeEventListener('pointerdown', refreshAfterInteraction, true)
    document.removeEventListener('pointerup', refreshAfterInteraction, true)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('blur', clearHover)
    window.removeEventListener('hashchange', clearHover)
    window.removeEventListener('scroll', clearHover, true)
    overlay.remove()
    style.remove()
    semanticObserver.disconnect()
  }
}
