import type { HomeResponse } from '../../features/product/product.types'

/** Desktop-only top section; the mini-program keeps the classic hero. */
export function HomeTop(_props: {
  data: HomeResponse
  onOpenPost: (postId: string) => void
  onOpenSchedule: () => void
}) {
  return null
}
