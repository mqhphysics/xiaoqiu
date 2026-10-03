import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localManagementPlugin } from './server/local-management.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': { target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: true },
  }
  return {
    plugins: [
      react(),
      localManagementPlugin({
        databaseUrl:
          env.ADMIN_DATABASE_URL ||
          env.DATABASE_URL ||
          'postgresql://xiaoqiu:xiaoqiu-local-only@127.0.0.1:5432/xiaoqiu',
        enabled: env.ADMIN_SINGLE_OWNER !== '0',
        development: mode === 'development',
        organizationId: env.VITE_ORGANIZATION_ID || '00000000-0000-4000-8000-000000000001',
        ownerLoginName: env.ADMIN_OWNER_USERNAME || 'admin',
      }),
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      open: false,
      proxy,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private-data/**'] },
    },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true, open: false, proxy },
  }
})
