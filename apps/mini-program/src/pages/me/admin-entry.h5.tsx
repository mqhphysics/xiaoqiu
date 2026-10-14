import { lazy, Suspense, type ReactNode } from 'react'

import { DataState } from '../../components/public-ui'

const AdminReportPanelLazy = lazy(() =>
  import('./admin-panels').then((mod) => ({ default: mod.AdminReportPanel })),
)
const AdminIdentityDirectoryLazy = lazy(() =>
  import('./admin-panels').then((mod) => ({ default: mod.AdminIdentityDirectory })),
)

function later(node: ReactNode) {
  return <Suspense fallback={<DataState kind="loading" title="正在打开管理功能" />}>{node}</Suspense>
}

export function AdminReportPanel() {
  return later(<AdminReportPanelLazy />)
}

export function AdminIdentityDirectory() {
  return later(<AdminIdentityDirectoryLazy />)
}
