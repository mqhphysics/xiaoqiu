import { Button } from '@tarojs/components'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import type { TeamPreferenceLayoutProps } from './team-preference-layout'
export function TeamPreferenceLayout({
  editing,
  editor,
  content,
  onClose,
  onSave,
  saving,
  canSave,
}: TeamPreferenceLayoutProps) {
  if (!content) return editor
  return (
    <>
      {content}
      {editing && (
        <NativeDialog
          title="主队与关注"
          onClose={onClose}
          busy={saving}
          footer={
            <Button
              className="native-button native-button--primary"
              disabled={!canSave || saving}
              loading={saving}
              onClick={onSave}
            >
              保存选择
            </Button>
          }
        >
          {editor}
        </NativeDialog>
      )}
    </>
  )
}
