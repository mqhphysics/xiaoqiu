import type { PropsWithChildren } from 'react'

/** WeChat retains its existing flow; this release changes the H5 account gate. */
export function AccountBoundary({ children }: PropsWithChildren) {
  return <>{children}</>
}
