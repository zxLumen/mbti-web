# mbti-web

对话式 MBTI 测评（独立子应用）。不预设固定题序，通过与用户自然语言问答，结合内置专业题库动态选题、逐步收敛到 4 字母 MBTI 类型。

- 前端：Vite + React + TypeScript
- 后端：Express
- AI：OpenAI 兼容（支持博客 AI 网关 zxGateway 或自定义）
- 结果：仅 4 字母
- 隐私：匿名，不存对话，统计只记结果

开发
```bash
npm i
npm run dev  # server :8787, web :5175 (proxy /api)
```

构建
```bash
npm run build  # 输出 dist/
npm start      # 生产模式
```
