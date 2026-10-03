import type { Plugin } from 'vite'
export function localManagementPlugin(options: {
  databaseUrl: string
  enabled: boolean
  development: boolean
  organizationId: string
  ownerLoginName: string
}): Plugin
