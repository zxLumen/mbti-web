# 心语 mbti-web:单服务(Express 同时发 dist/ 与 /api)
# 运行期用 Node 原生 TS 类型擦除加载 web/src/lib/*.ts,故运行时镜像需带上这些源文件。
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web/ ./web/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY web/src/lib/ ./web/src/lib/
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data /app/mascots
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "server.js"]
