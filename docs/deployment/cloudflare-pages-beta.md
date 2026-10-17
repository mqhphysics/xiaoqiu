# 内测环境：H5 静态站（Cloudflare Pages）+ 开发服务器 API

## 架构

- H5：Cloudflare Pages 静态托管（Taro H5 构建产物，hash 路由）。
- API：`117.72.215.74` 上的 Docker Compose（`/opt/xiaoqiu/src/infra/release`，`compose.yaml` + `compose.dev.yaml`），
  edge nginx 监听 `:9988`（`/api` → api，`/` → 管理中心）。
- HTTPS：服务器上的 `cloudflared` Quick Tunnel（systemd `xiaoqiu-tunnel.service`）把 `https://walter-latter-dont-productive.trycloudflare.com`
  转发到 `http://localhost:9988`。Quick Tunnel 地址在服务重启后会变化，变化后需更新 Pages 的
  `TARO_APP_API_BASE_URL` 并重新部署。查看当前地址：
  `journalctl -u xiaoqiu-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1`

## Cloudflare Pages 构建设置

| 项目 | 值 |
|---|---|
| Production branch | `beta` |
| Root directory | （留空，仓库根目录；pnpm workspace） |
| Build command | `corepack enable && pnpm install --frozen-lockfile --filter @xiaoqiu/mini-program... && pnpm --filter @xiaoqiu/mini-program build:h5` |
| Build output directory | `apps/mini-program/dist` |
| 环境变量 `NODE_VERSION` | `22.14.0` |
| 环境变量 `TARO_APP_API_BASE_URL` | `https://walter-latter-dont-productive.trycloudflare.com`（可带或不带 `/api`） |
| 环境变量 `NODE_ENV` | `production` |
| 可选 `TARO_APP_ORGANIZATION_ID` | `00000000-0000-4000-8000-000000000001` |

`TARO_APP_API_BASE_URL` 在构建时写入 bundle，修改后必须重新部署。
`apps/mini-program/public/_redirects`（`/* /index.html 200`）与 `_headers`（带哈希的 js/css 长缓存、
`index.html` 不缓存）会被复制到产物根目录。

## API 侧配置（服务器 `.env`，权限 600）

- `CORS_ORIGINS` 精确来源列表，支持子域通配：`https://xiaoqiu-beta.pages.dev,https://*.xiaoqiu-beta.pages.dev`
  （通配只匹配一个或多个子域标签，不匹配裸域、其他协议、端口或相似后缀）。Pages 项目名不同则相应修改并
  `docker compose -f compose.yaml -f compose.dev.yaml up -d --no-build api`。
- `REGISTRATION_ENABLED=false`：公开注册（`POST /api/auth/register`、`POST /api/auth/email/code` 且
  `purpose=REGISTER`）返回 403「测试阶段暂未开放注册」。生产默认关闭，本地开发默认开放。
  管理员创建账号与登录不受影响。

## 微信小程序（开发者工具）

`apps/mini-program/.env.beta` 指向 `http://117.72.215.74:9988/api`：

```
pnpm --filter @xiaoqiu/mini-program dev:weapp:beta   # 或 build:weapp:beta
```

开发者工具需关闭「校验合法域名」（`project.config.json` 已设 `urlCheck: false`）。正式发布仍需已备案的 HTTPS 域名。
本地开发命令（`dev:weapp`、`dev:h5`）不受影响，仍默认 `http://127.0.0.1:3001`。
