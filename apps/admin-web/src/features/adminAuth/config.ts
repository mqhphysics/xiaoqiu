export function configuredAdminApi(): string | null {
  const value = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE_URL?.trim()
  if (!value) return null
  const base = value.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base) && !/^\/(?!\/)/.test(base)) return null
  return base.endsWith('/api') ? base : `${base}/api`
}

export function requireAdminApi(): string {
  const api = configuredAdminApi()
  if (!api) throw new Error('管理服务尚未配置，请联系部署管理员。')
  return api
}
