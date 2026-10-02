import type { PostSummary } from '../../features/product/product.types'
export interface PostComposerProps {
  open: boolean
  onClose: () => void
  onPublished: (post: PostSummary) => void
}
export function DesktopPostComposer(_props: PostComposerProps) {
  return null
}
