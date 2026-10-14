import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  SPRING,
  draggedSlotOffset,
  itemShift,
  moveItem,
  prefersReducedMotion,
  reorderTargetIndex,
  springSettled,
  stepSpring,
  type ItemBox,
} from './spring.h5'

type Phase = 'idle' | 'dragging' | 'settling'

type Drag = {
  id: string
  pointerId: number
  from: number
  to: number
  startClientY: number
  startScroll: number
  offsetY: number
  lastClientY: number
  velocityY: number
  lastMoveAt: number
  boxes: ItemBox[]
  scroller: HTMLElement | null
  reduced: boolean
}

type Spring = { y: number; v: number; target: number }

function scrollableAncestor(node: HTMLElement | null): HTMLElement | null {
  let current = node
  while (current && current !== document.body) {
    const overflow = getComputedStyle(current).overflowY
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function measure(list: HTMLElement, ids: readonly string[], nodes: Map<string, HTMLDivElement>): ItemBox[] {
  const listRect = list.getBoundingClientRect()
  const scroll = list.scrollTop
  return ids.map((id) => {
    const node = nodes.get(id)
    if (!node?.isConnected) return { id, top: 0, height: 0 }
    const rect = node.getBoundingClientRect()
    return { id, top: rect.top - listRect.top + scroll, height: rect.height }
  })
}

/**
 * Vertical drag-to-reorder. Rows stay in document order until the gesture settles,
 * so a later layout pass can restyle the row without owning the spring.
 * Reduced motion snaps each crossed slot instead of springing.
 */
export function useSpringReorder<T extends { id: string }>(
  items: readonly T[],
  onReorder: (next: T[]) => void,
) {
  const itemsRef = useRef(items)
  const onReorderRef = useRef(onReorder)
  itemsRef.current = items
  onReorderRef.current = onReorder

  const listRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const springs = useRef(new Map<string, Spring>())
  const dragRef = useRef<Drag | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const frame = useRef(0)
  const frameCount = useRef(0)
  const clearOnLayout = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const writeTransforms = () => {
    for (const [id, spring] of springs.current) {
      const node = nodes.current.get(id)
      if (!node?.isConnected) continue
      node.style.transform = spring.y === 0 ? '' : `translate3d(0, ${spring.y}px, 0)`
    }
  }

  const stopLoop = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
  }

  const finish = (commit: boolean) => {
    const drag = dragRef.current
    phaseRef.current = 'idle'
    dragRef.current = null
    setDraggingId(null)
    stopLoop()
    if (commit && drag && drag.from !== drag.to) {
      clearOnLayout.current = true
      onReorderRef.current(moveItem(itemsRef.current, drag.from, drag.to))
      return
    }
    for (const node of nodes.current.values()) node.style.transform = ''
    springs.current.clear()
  }

  const tick = (now: number, last: number) => {
    const drag = dragRef.current
    if (!drag || phaseRef.current === 'idle') {
      frame.current = 0
      return
    }
    const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000))
    const { stiffness, damping } =
      phaseRef.current === 'dragging' ? SPRING.drag : SPRING.settle

    if (phaseRef.current === 'dragging' && drag.scroller) {
      const rect = drag.scroller.getBoundingClientRect()
      const edge = 36
      let delta = 0
      if (drag.lastClientY < rect.top + edge) delta = -6
      else if (drag.lastClientY > rect.bottom - edge) delta = 6
      if (delta) {
        drag.scroller.scrollTop += delta
        drag.offsetY = drag.lastClientY - drag.startClientY + (drag.scroller.scrollTop - drag.startScroll)
        const origin = drag.boxes[drag.from]
        if (origin) {
          const center = origin.top + origin.height / 2 + drag.offsetY
          drag.to = reorderTargetIndex(drag.boxes, drag.from, center)
          retarget(drag)
        }
      }
    }

    let settled = true
    for (const [id, spring] of springs.current) {
      if (phaseRef.current === 'dragging' && id === drag.id) {
        spring.y = drag.offsetY
        spring.v = 0
        spring.target = drag.offsetY
        settled = false
        continue
      }
      if (drag.reduced) {
        spring.y = spring.target
        spring.v = 0
      } else if (!springSettled(spring.y, spring.v, spring.target)) {
        const next = stepSpring(spring.y, spring.v, spring.target, dt, stiffness, damping)
        spring.y = next.value
        spring.v = next.velocity
        settled = false
      } else {
        spring.y = spring.target
        spring.v = 0
      }
    }
    writeTransforms()

    frameCount.current += 1
    if (phaseRef.current === 'settling' && (settled || drag.reduced || frameCount.current > 90)) {
      finish(true)
      return
    }
    frame.current = requestAnimationFrame((time) => tick(time, now))
  }

  const ensureLoop = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame((time) => tick(time, time))
  }

  const retarget = (drag: Drag) => {
    drag.boxes.forEach((box, index) => {
      const target =
        box.id === drag.id
          ? phaseRef.current === 'settling'
            ? draggedSlotOffset(drag.boxes, drag.from, drag.to)
            : drag.offsetY
          : itemShift(index, drag.from, drag.to, drag.boxes)
      const current = springs.current.get(box.id) ?? { y: 0, v: 0, target: 0 }
      springs.current.set(box.id, { ...current, target })
    })
  }

  const begin = (id: string, clientY: number, pointerId: number, reduced: boolean) => {
    const list = listRef.current
    const index = itemsRef.current.findIndex((item) => item.id === id)
    if (!list || index < 0 || phaseRef.current === 'settling') return
    const ids = itemsRef.current.map((item) => item.id)
    const boxes = measure(list, ids, nodes.current)
    const scroller = scrollableAncestor(list)
    const drag: Drag = {
      id,
      pointerId,
      from: index,
      to: index,
      startClientY: clientY,
      startScroll: scroller?.scrollTop ?? 0,
      offsetY: 0,
      lastClientY: clientY,
      velocityY: 0,
      lastMoveAt: performance.now(),
      boxes,
      scroller,
      reduced,
    }
    dragRef.current = drag
    phaseRef.current = 'dragging'
    frameCount.current = 0
    setDraggingId(id)
    retarget(drag)
    ensureLoop()
  }

  useLayoutEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [])

  useLayoutEffect(() => {
    if (!clearOnLayout.current) return
    clearOnLayout.current = false
    for (const node of nodes.current.values()) node.style.transform = ''
    springs.current.clear()
  }, [items])

  useLayoutEffect(() => {
    const live = new Set(items.map((item) => item.id))
    for (const id of nodes.current.keys()) {
      if (!live.has(id)) nodes.current.delete(id)
    }
  }, [items])

  const bindItem = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const id = node.dataset.reorderId
    if (id) nodes.current.set(id, node)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const id = event.currentTarget.dataset.reorderHandle
    if (!id) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    begin(id, event.clientY, event.pointerId, prefersReducedMotion())
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId || phaseRef.current !== 'dragging') return
    const now = performance.now()
    const elapsed = Math.max(0.008, (now - drag.lastMoveAt) / 1000)
    const instant = (event.clientY - drag.lastClientY) / elapsed
    drag.velocityY = drag.velocityY * 0.65 + instant * 0.35
    drag.lastMoveAt = now
    drag.lastClientY = event.clientY
    const scroll = drag.scroller?.scrollTop ?? drag.startScroll
    drag.offsetY = event.clientY - drag.startClientY + (scroll - drag.startScroll)
    const origin = drag.boxes[drag.from]
    if (!origin) return
    const center = origin.top + origin.height / 2 + drag.offsetY
    drag.to = reorderTargetIndex(drag.boxes, drag.from, center)
    retarget(drag)
  }

  const endPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId || phaseRef.current !== 'dragging') return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.from === drag.to) {
      finish(false)
      return
    }
    phaseRef.current = 'settling'
    frameCount.current = 0
    const current = springs.current.get(drag.id)
    if (current) {
      const velocity = Math.max(-1600, Math.min(1600, drag.velocityY))
      springs.current.set(drag.id, { ...current, v: velocity })
    }
    retarget(drag)
    if (drag.reduced) {
      for (const spring of springs.current.values()) {
        spring.y = spring.target
        spring.v = 0
      }
      writeTransforms()
      finish(true)
      return
    }
    ensureLoop()
  }

  const moveBy = (id: string, delta: -1 | 1) => {
    if (phaseRef.current !== 'idle') return
    const list = itemsRef.current
    const from = list.findIndex((item) => item.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    const reduced = prefersReducedMotion()
    if (reduced) {
      onReorderRef.current(moveItem(list, from, to))
      return
    }
    const host = listRef.current
    if (!host) return
    const boxes = measure(
      host,
      list.map((item) => item.id),
      nodes.current,
    )
    dragRef.current = {
      id,
      pointerId: -1,
      from,
      to,
      startClientY: 0,
      startScroll: 0,
      offsetY: 0,
      lastClientY: 0,
      velocityY: 0,
      lastMoveAt: 0,
      boxes,
      scroller: null,
      reduced: false,
    }
    phaseRef.current = 'settling'
    frameCount.current = 0
    setDraggingId(id)
    retarget(dragRef.current)
    ensureLoop()
  }

  return {
    listRef,
    draggingId,
    bindItem,
    handleProps: (id: string) => ({
      'data-reorder-handle': id,
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    }),
    moveBy,
  }
}
