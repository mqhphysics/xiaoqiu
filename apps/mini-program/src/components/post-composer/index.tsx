import type { PostSummary, PostTag } from '../../features/product/product.types'
export interface PostComposerProps {
  open: boolean
  onClose: () => void
  onPublished: (post: PostSummary) => void
  teamId?: string
  tournamentId?: string | undefined
  initialTags?: PostTag[]
}
export function DesktopPostComposer(_props: PostComposerProps) {
  return null
}
