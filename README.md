# mbti-web

对话式 MBTI 测评（独立子应用，经应用栏 `panel` 嵌入）。**不照搬题库出题**：把题库当作
"测量意图的参照"，由大模型**即兴编出有温度的生活场景**与用户自然对话，每轮先承接上一句再
抛出场景与开放问题（附 2 个软参考词），按四维置信度**逐步收敛**，最后给出 **4 字母**类型 +
一段温暖的个性化解读。

- 前端：Vite + React + TypeScript
- 后端：Express（Node 原生 TS 类型擦除运行，无需预编译）
- AI：OpenAI 兼容（支持博客 AI 网关 `zxGateway` 或自定义）。**未配置模型时降级为直接展示题库题**
- 隐私：匿名，**不存对话**；统计只记「开始 / 完成 / 类型」计数

## 结构

```
server.js               Express 服务 + 匿名统计 + 设置读写 + 调 LLM(生成场景/判读/结果)
web/src/lib/
  mbti-bank.ts          题库(约 120 题;仅作“测量意图的参照”,不直接展示)
  mbti-engine.ts        纯逻辑:选探测维度/置信度/收敛/计分/计算类型
  prompts.ts            三份 prompt:场景生成 / 判读 / 结果解读
  api.ts                前端接口封装
web/src/pages/          TestPage(对话) / Result(结果) / Settings(配置)
data/                   settings.json + keys.json(本地,已 gitignore)
```

## 开发 / 运行

本地与生产同构：**单进程单端口**，由 Express 同时发前端页面与 `/api`。

```bash
npm i
npm run dev        # = build + start，单服务 :8787
# 或分开：
npm run build      # 构建前端到 dist/
npm start          # 起 Express(:8787),同时发 dist/ 与 /api
npm run watch      # 仅后端改动时自动重启(node --watch)
```

打开 `http://localhost:8787/`。改前端源码后需重新 `npm run build`（无独立 Vite 开发服务器）。

> 后端用 Node 内置的 TS 类型擦除(`--experimental-strip-types`)直接跑 `.ts` 源;
> `web/src/lib/*.ts` 顶部的 `import type` 会被擦除,故服务端可零构建复用同一份题库与引擎。

## 收敛参数（engine）

| 参数 | 值 | 说明 |
| --- | --- | --- |
| minQ | 12 | 最少题数 |
| maxQ | 30 | 上限,到达即结束并在结果页标注置信度 |
| confT | 0.85 | 四维置信度阈值(每维约 5 道一致作答即可达标) |
| TTL | 45min | 会话(内存)过期时间 |

## 配置（仅站长）

设置页「设置」读写服务端配置(`data/settings.json` + `data/keys.json`)。**只有站长可修改**：
`POST /api/settings` 会校验站长身份,非站长返回 `403`;非站长看到的是只读视图。

站长判定（对齐 luminari/Opentodo 等子应用）：
- 博客的 `zx_admin` cookie 用**共享的 `SESSION_SECRET`** 验签 → 已登录博客即视为站长
  （生产 `ADMIN_COOKIE_DOMAIN=.zxlumen.cn`；本地 host-only、跨端口共享）。
- 兜底：`MBTI_OWNER_TOKEN` 或 `data/owner.token`；访问 `/?owner=<token>` 可种下 `mbti_owner` cookie。

网关地址：`zxGateway` 时 `settings.baseURL` → `ZX_AI_GATEWAY_URL`（线上 `http://app:3000/api/ai/v1`）
→ `ZX_GATEWAY_BASE_URL` → 本地默认 `http://localhost:3000/api/ai/v1`；token 取 `settings.apiKey`
/ `data/keys.json`，兜底 `ZX_AI_APP_TOKEN`。未取到模型时返回 `degraded:true`，前端提示「简易模式」并回退题库题。

**思考强度**：`settings.reasoningEffort`（`none` / `low` / `default`，默认 `none`）。思考型模型默认会先产
`reasoning_content`（思维链）、首字慢；设 `none` 时请求带 `reasoning_effort:"none"` 直接作答，实测首字由 ~3.3s 降到 ~1.4s。

环境变量（`mbti-web/.env.local`，已 gitignore）：`SESSION_SECRET`（与博客一致）。
