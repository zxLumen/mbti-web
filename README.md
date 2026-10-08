# mbti-web

对话式 MBTI 测评（独立子应用，经应用栏 `panel` 嵌入）。不预设固定题序：通过与用户自然语言
问答，结合内置专业题库**动态选题**，按四维置信度**逐步收敛**，最后给出 **4 字母** MBTI 类型。

- 前端：Vite + React + TypeScript
- 后端：Express（Node 原生 TS 类型擦除运行，无需预编译）
- AI：OpenAI 兼容（支持博客 AI 网关 `zxGateway` 或自定义），未配置时回退本地规则判断
- 隐私：匿名，**不存对话**；统计只记「开始 / 完成 / 类型」计数

## 结构

```
server.js               Express 服务 + 匿名统计 + 设置读写
web/src/lib/
  mbti-bank.ts          题库（约 120 题,中文,单轴主导）
  mbti-engine.ts        纯逻辑:选题/置信度/收敛/计算类型
  prompts.ts            归类用 system prompt
  api.ts                前端接口封装
web/src/pages/          TestPage(测评) / Result(结果) / Settings(配置)
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

## 配置

设置页 `/`→「设置」选择服务商并保存(服务端存 `data/settings.json` + `data/keys.json`）。
可选：`ZX_GATEWAY_BASE_URL` 环境变量为 `zxGateway` 提供默认地址。未配置时测评仍可用,
只按 A/B/不确定做规则归类。
