import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Only the foremost overlay handles keyboard input; nested details retain focus.
const overlayStack: symbol[] = []
let initialOverflow = ''

export function useOverlayFocus(
  enabled: boolean,
  panelSelector: string,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!enabled) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const entry = Symbol(panelSelector)
    if (overlayStack.length === 0) initialOverflow = document.body.style.overflow
    overlayStack.push(entry)
    const panel = document.querySelector<HTMLElement>(panelSelector)
    const focusFirst = () => {
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }
    const timer = window.setTimeout(focusFirst, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (overlayStack.at(-1) !== entry) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      const wasTop = overlayStack.at(-1) === entry
      const index = overlayStack.indexOf(entry)
      if (index >= 0) overlayStack.splice(index, 1)
      if (overlayStack.length === 0) document.body.style.overflow = initialOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [enabled, panelSelector])
}
