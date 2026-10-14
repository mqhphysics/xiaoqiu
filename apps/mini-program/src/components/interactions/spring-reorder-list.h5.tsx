import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useSpringReorder } from './use-spring-reorder.h5'
import './interactions.h5.scss'

export type ReorderHandleProps = {
  'data-reorder-handle': string
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

export function SpringReorderList<T extends { id: string }>({
  items,
  label,
  onReorder,
  renderRow,
}: {
  items: readonly T[]
  label: string
  onReorder: (next: T[]) => void
  renderRow: (
    item: T,
    index: number,
    controls: {
      dragging: boolean
      handleProps: ReorderHandleProps
      moveUp: () => void
      moveDown: () => void
    },
  ) => ReactNode
}) {
  const reorder = useSpringReorder(items, onReorder)
  return (
    <div
      ref={reorder.listRef}
      className={`xq-reorder ${reorder.draggingId ? 'is-reordering' : ''}`}
      role="list"
      aria-label={label}
      data-spring-reorder=""
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          role="listitem"
          className={`xq-reorder-item ${reorder.draggingId === item.id ? 'is-dragging' : ''}`}
          ref={reorder.bindItem}
          data-reorder-id={item.id}
        >
          {renderRow(item, index, {
            dragging: reorder.draggingId === item.id,
            handleProps: reorder.handleProps(item.id),
            moveUp: () => reorder.moveBy(item.id, -1),
            moveDown: () => reorder.moveBy(item.id, 1),
          })}
        </div>
      ))}
    </div>
  )
}
