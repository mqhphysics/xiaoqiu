import Taro from '@tarojs/taro'

import {
  createDraftKey,
  getRestoreDecision,
  type DraftContext,
  type QuickReportDraft,
} from './quick-report.logic'

export interface QuickReportDraftRepository {
  read(context: DraftContext): Promise<QuickReportDraft | null>
  write(draft: QuickReportDraft): Promise<void>
  remove(context: DraftContext): Promise<void>
}

class TaroQuickReportDraftRepository implements QuickReportDraftRepository {
  async read(context: DraftContext): Promise<QuickReportDraft | null> {
    const key = createDraftKey(context)

    try {
      const result = await Taro.getStorage<QuickReportDraft>({ key })
      const draft = result.data

      if (getRestoreDecision(draft, draft.baseVersion) === 'EXPIRED') {
        await Taro.removeStorage({ key })
        return null
      }

      return draft
    } catch {
      return null
    }
  }

  async write(draft: QuickReportDraft): Promise<void> {
    await Taro.setStorage({
      key: createDraftKey(draft.context),
      data: draft,
    })
  }

  async remove(context: DraftContext): Promise<void> {
    await Taro.removeStorage({ key: createDraftKey(context) })
  }
}

export const quickReportDraftRepository: QuickReportDraftRepository =
  new TaroQuickReportDraftRepository()
