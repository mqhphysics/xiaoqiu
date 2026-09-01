# 2026-06 初始开发服务日志

以下内容由仓库根目录四个临时日志合并而来。它们只证明 P0 骨架曾在本机启动，当前运行状态应通过健康检查确认。

## 管理端

```text
VITE v8.0.16 ready in 285 ms
Local: http://localhost:5173/
pnpm --filter @xiaoqiu/admin-web dev -- --host 127.0.0.1
```

## API

```text
NestFactory Starting Nest application...
AppModule dependencies initialized
Mapped /api/health GET route
Nest application successfully started
pnpm --filter @xiaoqiu/api dev
tsx watch src/main.ts
```
