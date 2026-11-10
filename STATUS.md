# mbti-web — 状态

- **状态**：维护（低频使用，功能可用；不再主动加功能）
- **线上地址**：https://mbti.zxlumen.cn
- **健康检查**：暂无专用端点；`GET /` 与 `GET /api/health` 均返回 SPA HTML 200，不能反映依赖状态
- **镜像**：`ghcr.io/zxlumen/mbti-web:latest`（构建于 2026-10-09 15:14 UTC，对应 `6077b1f`）
- **最后提交**：`6077b1f` — 2026-10-09 `feat(mbti): 站长报告服务器同步(收养缺失 + 回填新增,自动)`
- **部署位置**：`/home/ubuntu/zxLumen-Blog/docker/docker-compose.yml` 的 `mbti` 服务，容器 `docker-mbti-1`，端口 8787，数据卷 `docker_mbti-data:/app/data`

## 体检快照（2026-11-10）

| 项目 | 结果 |
| --- | --- |
| 首页 `GET /` | 200，0.167s |
| `GET /api/health` | 200（SPA 兜底 HTML，非健康检查） |
| 容器状态 | Up 4 天，RestartCount=0，restart=unless-stopped |
| 7 天 5xx（容器日志） | 0 |
| 异常栈 / Error（容器日志） | 0 |
| Caddy 请求数（mbti.zxlumen.cn） | 112，其中 200×83、206×3、304×18、308×3、403×4、499×1、5xx×0 |
| 日志实际覆盖 | 2026-11-07 03:02 → 2026-11-10 03:01 UTC（约 2.9 天；Caddy 仅保留 5 个轮转文件） |

> 注：Caddy 访问日志只保留约 3 天，无法回溯完整 7 天；上表请求数为现有日志窗口内的全量。
> 4 次 403 均为匿名访问站长接口 `/api/mbti/records`（预期行为），另有 1 次 499 客户端提前断开，均非服务端故障。

## 已知缺口 / 待办

1. 没有 `/api/health`，健康探测拿到的是前端 HTML 200；进程假活或 AI 网关不可用时无法被外部发现。
2. 容器未配置 Docker `HEALTHCHECK`；内存上限 128MB。
3. 镜像缺少 `org.opencontainers.image.revision` 标签，无法从镜像反查精确提交。
4. 日志只输出启动行，无应用访问日志；排障依赖 Caddy access log，且后者保留不足 7 天。
5. 无自动化测试（`package.json` 未定义 test），核心计分/收敛逻辑仅靠手工验证。
6. 强依赖博客 AI 网关；未取到模型时降级为题库模式（`degraded:true`），属于预期兜底。
7. 会话写 `data/sessions.json`（6h TTL），重启不丢；`settings.json` / `keys.json` 位于数据卷内，注意备份。

## 重启 / 发布条件

- 仅在以下情况重启：GHCR 有新镜像需发布、容器异常退出、设置/密钥变更、内存排查。
- 发布：`cd /home/ubuntu/zxLumen-Blog/docker && docker compose pull mbti && docker compose up -d mbti`
- 快速重启：`docker restart docker-mbti-1`
- 前置依赖：`docker/.env` 中 `MBTI_AI_TOKEN`、`SESSION_SECRET` 就绪；数据卷 `docker_mbti-data` 保留会话/设置/密钥。
- 重启后验收：`curl -fsS -o /dev/null -w '%{http_code}' https://mbti.zxlumen.cn/` 返回 200，完成一次对话到结果页（或确认降级题库模式可用）。
