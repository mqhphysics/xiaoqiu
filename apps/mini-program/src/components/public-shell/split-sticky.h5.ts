import {
  SPLIT_SCROLL_SELECTOR,
  availableStickyHeight,
  chooseStickyIndexes,
  countGridColumns,
  stickyOffset,
} from './split-sticky.logic'

const STICKY_CLASS = 'is-split-sticky'

function elementChildren(container: Element): HTMLElement[] {
  return [...container.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  )
}

function overlayScroller(container: HTMLElement): HTMLElement | null {
  let node = container.parentElement
  while (node) {
    if (node.classList.contains('public-app') || node.classList.contains('taro_page')) return null
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function updateContainer(container: HTMLElement): void {
  const children = elementChildren(container)
  const columnCount = countGridColumns(getComputedStyle(container).gridTemplateColumns)
  const overlay = overlayScroller(container)
  const header = container.closest('.public-app')?.querySelector('.public-topbar')
  const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0
  const offset = stickyOffset(headerHeight, overlay !== null)
  const viewport = overlay ? overlay.clientHeight : window.innerHeight
  const available = availableStickyHeight(viewport, offset)
  const sticky = new Set(
    chooseStickyIndexes(
      children.map((child) => child.getBoundingClientRect().height),
      available,
      columnCount,
    ),
  )
  children.forEach((child, index) => {
    const pin = sticky.has(index)
    child.classList.toggle(STICKY_CLASS, pin)
    if (pin) child.style.setProperty('--split-sticky-top', `${offset}px`)
    else child.style.removeProperty('--split-sticky-top')
  })
}

/** Watch split shells and pin the shorter column when it fits the scrollport. */
export function bindSplitSticky(root: ParentNode): () => void {
  const resizeObserver = new ResizeObserver(() => {
    schedule()
  })
  const observed = new Set<HTMLElement>()

  const scan = () => {
    for (const node of root.querySelectorAll(SPLIT_SCROLL_SELECTOR)) {
      if (!(node instanceof HTMLElement)) continue
      if (!observed.has(node)) {
        observed.add(node)
        resizeObserver.observe(node)
      }
      for (const child of elementChildren(node)) resizeObserver.observe(child)
      updateContainer(node)
    }
  }

  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      scan()
    })
  }

  scan()
  const mutationObserver = new MutationObserver(schedule)
  if (root instanceof Node) mutationObserver.observe(root, { childList: true, subtree: true })
  window.addEventListener('resize', schedule)

  return () => {
    if (frame) window.cancelAnimationFrame(frame)
    mutationObserver.disconnect()
    resizeObserver.disconnect()
    window.removeEventListener('resize', schedule)
    for (const container of observed) {
      for (const child of elementChildren(container)) {
        child.classList.remove(STICKY_CLASS)
        child.style.removeProperty('--split-sticky-top')
      }
    }
  }
}
