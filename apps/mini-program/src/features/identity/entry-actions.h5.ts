import Taro from '@tarojs/taro'
import type {
  AccountCapabilities,
  ProductActionId,
} from '../../../../../packages/contracts/src/product-config'
import { productConfigRepository } from '../product-config/product-config.repository'
import { runFeatureAction } from '../product-config/product-config.logic'
import { productRepository } from '../product/product.repository'
import { readonlyScheduleRepository } from '../readonly-schedule/readonly-schedule.repository'
import { openIdentity } from './identity.repository.h5'
import { canReportMatch, managedTeamIds } from './entry-scope'

const notify = (title: string) => Taro.showToast({ title, icon: 'none' })

async function accountAction(
  action: ProductActionId,
  perform: (caps: AccountCapabilities) => Promise<void>,
) {
  try {
    const caps = await productConfigRepository.getCapabilities()
    await runFeatureAction(caps.actions[action], () => perform(caps), notify)
  } catch (issue) {
    if (
      issue &&
      typeof issue === 'object' &&
      'errMsg' in issue &&
      String(issue.errMsg).includes('cancel')
    )
      return
    await notify(issue instanceof Error ? issue.message : '暂时无法读取操作权限，请重试')
  }
}

async function choose<T>(items: T[], label: (item: T) => string): Promise<T> {
  if (!items.length) throw new Error('当前没有可操作的对象，请刷新后重试')
  if (items.length === 1) return items[0]!
  let page = 0
  for (;;) {
    const current = items.slice(page * 5, page * 5 + 5)
    const more = (page + 1) * 5 < items.length
    const itemList = [
      ...current.map(label),
      ...(more ? ['下一页'] : page > 0 ? ['返回第一页'] : []),
    ]
    const answer = await Taro.showActionSheet({ itemList })
    if (answer.tapIndex < current.length) return current[answer.tapIndex]!
    page = more ? page + 1 : 0
  }
}

export const identityEntryActions = {
  identity: () =>
    accountAction('identityApplications.submit', async () => {
      openIdentity()
    }),
  teamManagement: () =>
    accountAction('teams.manage', async (caps) => {
      const teams = await Promise.all(
        managedTeamIds(caps.actions['teams.manage']).map((id) =>
          productRepository.getCaptainWorkspace(id),
        ),
      )
      const selected = await choose(teams, (workspace) => workspace.team.name)
      await Taro.navigateTo({
        url: `/pages/my-team/index?teamId=${encodeURIComponent(selected.team.id)}`,
      })
    }),
  informationEntry: () =>
    accountAction('matchReports.write', async (caps) => {
      const tournaments = await readonlyScheduleRepository.listTournaments()
      if (tournaments.source !== 'api') throw new Error('信息录入需要连接真实 API')
      const schedules = await Promise.all(
        tournaments.data.map((tournament) => readonlyScheduleRepository.listMatches(tournament.id)),
      )
      if (schedules.some((schedule) => schedule.source !== 'api'))
        throw new Error('信息录入需要连接真实 API')
      const matches = schedules
        .flatMap((schedule) => schedule.data)
        .filter((match) =>
          canReportMatch(caps.actions['matchReports.write'], caps.organizationId, match),
        )
      const selected = await choose(
        matches,
        (match) =>
          `${match.homeTeamName} vs ${match.awayTeamName} · ${match.scheduledStartAt.slice(0, 10)}`,
      )
      await Taro.navigateTo({
        url: `/pages/quick-report/index?matchId=${encodeURIComponent(selected.id)}`,
      })
    }),
  administrationEntry: () =>
    accountAction('administration.manage', async () => {
      window.location.assign('/admin/')
    }),
}
