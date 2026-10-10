import { useEffect, useRef } from 'react'

import { bindSplitSticky } from './split-sticky.h5'
import './split-sticky.h5.scss'

/** Mounts the desktop split-column pin behavior for this page shell. */
export function SplitSticky() {
  const anchorRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const root = anchorRef.current?.closest('.public-app')
    if (!root) return
    return bindSplitSticky(root)
  }, [])
  return <span ref={anchorRef} hidden />
}
