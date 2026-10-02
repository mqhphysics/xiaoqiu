import type { PostSummary } from '../../features/product/product.types'
export interface PostComposerProps {
  open: boolean
  onClose: () => void
  onPublished: (post: PostSummary) => void
  teamId?: string
}
export function DesktopPostComposer(_props: PostComposerProps) {
  return null
}
