const loaders: Record<string, () => Promise<unknown>> = {
  home: () => import('../../pages/index/index'),
  schedule: () => import('../../pages/readonly-schedule/index'),
  data: () => import('../../pages/data-center/index'),
  team: () => import('../../pages/my-team/index'),
  teams: () => import('../../pages/readonly-teams/index'),
  me: () => import('../../pages/me/index'),
  match: () => import('../../pages/readonly-match-detail/index'),
}

const started = new Set<string>()

export function prefetchSection(section: string): void {
  if (started.has(section)) return
  const load = loaders[section]
  if (!load) return
  started.add(section)
  void load().catch(() => {
    started.delete(section)
  })
}

export function prefetchTabsWhenIdle(): void {
  const run = () => {
    for (const key of Object.keys(loaders)) prefetchSection(key)
  }
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback
  if (typeof idle === 'function') idle(run, { timeout: 1500 })
  else setTimeout(run, 400)
}
