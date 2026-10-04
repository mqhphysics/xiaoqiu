import Taro from '@tarojs/taro'
import type {
  AccountCapabilities,
  ProductConfiguration,
} from '../../../../../packages/contracts/src/product-config'
import { readSession } from '../product/session'
import { parseProductConfiguration } from './product-config.logic'

export const productConfigRepository = {
  async getConfiguration(): Promise<ProductConfiguration> {
    // This endpoint is organization independent and sends no account token/organization selector.
    const response = await Taro.request<unknown>({
      url: `${apiBase()}/product/config`,
      method: 'GET',
      timeout: 8000,
    })
    if (response.statusCode !== 200) throw new Error('暂时无法读取产品配置，请重试')
    return parseProductConfiguration(response.data)
  },
  async getCapabilities(): Promise<AccountCapabilities> {
    const session = readSession()
    if (!session) throw new Error('请先登录账号')
    const response = await Taro.request<AccountCapabilities>({
      url: `${apiBase()}/me/capabilities`,
      method: 'GET',
      timeout: 8000,
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        'x-organization-id': session.user.organizationId,
      },
    })
    if (
      response.statusCode !== 200 ||
      response.data.schemaVersion !== 1 ||
      response.data.organizationId !== session.user.organizationId
    )
      throw new Error('暂时无法读取账号能力，请重新验证会话')
    return response.data
  },
}

function apiBase(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!configured) throw new Error('尚未配置 API 地址')
  return configured.endsWith('/api') ? configured : `${configured}/api`
}
