# Production Deployment Guide

这份文档说明如何从零部署 `support-chat-runtime`，并明确区分当前仓库已经能真实运行的能力，以及目前仍属于模板、实验或需要二次开发的能力。

## 1. 当前能力边界

### 1.1 现在可以直接落地的能力

当前仓库已经具备以下可运行能力：

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 前端聊天界面 | 已实现 | `frontend/` 使用 React + Vite，可构建成静态文件。 |
| Node.js bridge 服务 | 已实现 | `bridge/src/server.js` 提供 HTTP API，并可同时托管前端静态文件。 |
| 匿名访客 ID | 已实现 | 前端在浏览器 `localStorage` 中生成并保存 visitor id。 |
| 会话映射 | 已实现 | bridge 将 visitor id 映射为 `support:webchat:<visitorId>` 形式的 session key。 |
| mock 聊天模式 | 已实现 | `BRIDGE_MODE=mock` 可本地保存会话与 mock 回复，适合演示、验收 UI 和验证部署链路。 |
| external 后端转发模式 | 已实现 | `BRIDGE_MODE=external` 会把 chat/history 请求转发到你提供的 HTTP 后端。 |
| 健康检查 | 已实现 | `GET /api/health` 返回 `{ "ok": true, "mode": "..." }`。 |
| systemd 示例 | 已提供，可直接改路径使用 | `deploy/systemd/support-chat-runtime.service`。 |
| Cloudflare Tunnel 示例 | 已提供，可按域名和凭证改造使用 | `deploy/cloudflared/config.yml.example`。 |
| 基础 smoke test | 已实现 | `bridge/test/smoke.test.js` 覆盖 mock 模式下的 health/session/chat/history。 |

### 1.2 现在不能直接承诺生产可用的能力

下面这些能力在当前仓库中没有完整实现，不能在部署时当成已内置能力使用：

| 能力 | 当前状态 | 生产使用建议 |
| --- | --- | --- |
| 真正的客服/AI 回答能力 | 未内置 | 需要你自己实现 external backend，并接入 `BACKEND_CHAT_URL` 与 `BACKEND_HISTORY_URL`。 |
| 用户鉴权、后台管理、多租户 | 未实现 | 如需要登录态、租户隔离、管理后台，需要二次开发。 |
| 限流、验证码、反滥用 | 未实现 | 建议在反向代理、网关或 external backend 中实现。 |
| 数据库持久化 | 未实现 | bridge 当前只用本地 JSON 文件保存 visitor/session 映射和 mock transcript；生产聊天记录应由 external backend 持久化。 |
| 水平扩容 | 未完整支持 | 本地 JSON 文件不适合多实例共享；多实例部署需改成共享存储或让 external backend 管理会话。 |
| WebSocket/SSE 流式回复 | 未实现 | 当前是普通 HTTP request/response。 |
| 指标、告警、审计日志 | 仅有基础日志 | 生产环境需要自行接入日志采集、指标和告警。 |
| 实验链路 | 已有接口和 helper 调用，但不是默认生产路径 | `/api/chat/experimental` 更适合验证新后端，不建议作为默认生产链路直接暴露。 |
| `ops/` 脚本 | 工具脚本，不是完整平台能力 | 可按需使用，但不等同于完整运营后台。 |

结论：

- 如果你只是要部署一个可打开、可聊天、可验收前端和基础 API 的网页客服壳，`mock` 模式已经能跑。
- 如果你要面向真实用户生产使用，推荐使用 `external` 模式，并由你自己的后端提供真实回答、历史记录、鉴权、限流、持久化和审计。

## 2. 架构概览

生产推荐结构：

```text
Browser
  |
  | HTTPS
  v
Reverse Proxy / Tunnel
  |
  | http://127.0.0.1:8787
  v
support-chat-runtime bridge
  |-- serves frontend/dist
  |-- /api/health
  |-- /api/session/init
  |-- /api/chat
  |-- /api/history
  |
  | BRIDGE_MODE=external
  v
Your production support backend
  |-- real reply generation
  |-- durable history storage
  |-- auth / rate limit / audit if needed
```

本仓库的 bridge 做三件事：

1. 托管构建后的前端静态文件。
2. 为匿名浏览器访客维护 visitor id 到 session key 的映射。
3. 在 `mock` 或 `external` 模式下处理 chat/history API。

## 3. 服务器准备

以下步骤以 Ubuntu/Debian 系服务器为例。其他 Linux 发行版可以按等价命令安装 Node.js、npm、systemd 和反向代理。

### 3.1 安装基础软件

```bash
sudo apt-get update
sudo apt-get install -y git nodejs npm curl
```

建议 Node.js 版本不低于 18，因为 bridge 使用了 Node 内置 `fetch` 与 `AbortSignal.timeout`。

检查版本：

```bash
node --version
npm --version
```

### 3.2 创建部署目录

推荐部署到 `/opt/support-chat-runtime`：

```bash
sudo mkdir -p /opt/support-chat-runtime
sudo chown -R "$USER":"$USER" /opt/support-chat-runtime
```

### 3.3 拉取代码

```bash
git clone https://github.com/zenenznze/support-chat-runtime.git /opt/support-chat-runtime
cd /opt/support-chat-runtime
```

如果你使用自己的 fork，把 URL 换成你的仓库地址。

## 4. 构建前端

```bash
cd /opt/support-chat-runtime/frontend
npm ci
npm run build
```

成功后会生成：

```text
/opt/support-chat-runtime/frontend/dist
```

bridge 会默认从 `../frontend/dist` 读取静态文件；如果你的目录不同，可以通过 `FRONTEND_DIST_DIR` 指定。

## 5. 安装 bridge 依赖

```bash
cd /opt/support-chat-runtime/bridge
npm ci
```

## 6. 配置运行模式

bridge 配置文件示例在：

```text
/opt/support-chat-runtime/bridge/.env.example
```

生产环境推荐把配置放到：

```text
/etc/default/support-chat-runtime
```

这样 systemd service 可以统一读取。

### 6.1 mock 模式配置

mock 模式适合：

- 首次部署验收。
- 验证前端、bridge、反向代理、TLS、systemd 是否正常。
- 演示匿名会话流程。

它不适合真实客服生产，因为回复只是固定 mock 文案。

创建配置：

```bash
sudo tee /etc/default/support-chat-runtime >/dev/null <<'EOF'
PORT=8787
NODE_ENV=production
BRIDGE_MODE=mock
MOCK_ASSISTANT_NAME=Support Bot
BRIDGE_DATA_DIR=/var/lib/support-chat-runtime
FRONTEND_DIST_DIR=/opt/support-chat-runtime/frontend/dist
EOF
```

创建数据目录：

```bash
sudo mkdir -p /var/lib/support-chat-runtime
sudo chown -R "$USER":"$USER" /var/lib/support-chat-runtime
```

### 6.2 external 模式配置

external 模式适合真实生产：bridge 负责前端与会话映射，你的后端负责真实回答和历史记录。

你的后端必须实现：

- `POST BACKEND_CHAT_URL`
- `GET BACKEND_HISTORY_URL`

接口契约见：

```text
docs/backend-contract.md
```

配置示例：

```bash
sudo tee /etc/default/support-chat-runtime >/dev/null <<'EOF'
PORT=8787
NODE_ENV=production
BRIDGE_MODE=external
BACKEND_CHAT_URL=https://api.example.com/support/chat
BACKEND_HISTORY_URL=https://api.example.com/support/history
BACKEND_TIMEOUT_MS=60000
BRIDGE_DATA_DIR=/var/lib/support-chat-runtime
FRONTEND_DIST_DIR=/opt/support-chat-runtime/frontend/dist
EOF
```

注意：

- `BACKEND_CHAT_URL` 和 `BACKEND_HISTORY_URL` 必须返回 JSON。
- 后端返回非 2xx 或 `{ "ok": false }` 时，bridge 会向前端返回 502。
- 当前 bridge 不会为 external backend 自动附加鉴权 token。如果你的后端需要鉴权，建议先在反向代理、专用内网、或后端侧做可信来源控制；或者二次开发 bridge 增加后端认证头。

## 7. 本地前台启动验证

在配置 systemd 前，先前台启动一次，便于看到日志。

```bash
cd /opt/support-chat-runtime/bridge
set -a
. /etc/default/support-chat-runtime
set +a
npm run start
```

新开一个终端验证：

```bash
curl -fsS http://127.0.0.1:8787/api/health
```

预期：

```json
{"ok":true,"mode":"mock"}
```

或 external 模式：

```json
{"ok":true,"mode":"external"}
```

访问前端：

```text
http://127.0.0.1:8787
```

如果服务器没有图形界面，可以通过反向代理配置后从浏览器访问域名。

## 8. systemd 服务化

仓库已提供模板：

```text
deploy/systemd/support-chat-runtime.service
```

模板默认使用：

- 工作目录：`/opt/support-chat-runtime/bridge`
- 环境文件：`/etc/default/support-chat-runtime`
- 启动命令：`node /opt/support-chat-runtime/bridge/src/server.js`
- 运行用户：`ubuntu`

如果你的服务器用户不是 `ubuntu`，必须修改 service 文件中的 `User=`。

### 8.1 安装 service

```bash
sudo cp /opt/support-chat-runtime/deploy/systemd/support-chat-runtime.service /etc/systemd/system/support-chat-runtime.service
```

如需修改运行用户：

```bash
sudo editor /etc/systemd/system/support-chat-runtime.service
```

例如把：

```ini
User=ubuntu
```

改成：

```ini
User=www-data
```

同时确保该用户能读取代码目录，并能写入 `BRIDGE_DATA_DIR`。

### 8.2 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now support-chat-runtime
sudo systemctl status support-chat-runtime --no-pager
```

查看日志：

```bash
journalctl -u support-chat-runtime -f
```

健康检查：

```bash
curl -fsS http://127.0.0.1:8787/api/health
```

## 9. 反向代理与 HTTPS

你至少需要一种公网入口：

- Nginx/Caddy + TLS 证书。
- Cloudflare Tunnel。
- 其他云厂商负载均衡器。

### 9.1 Nginx 示例

安装：

```bash
sudo apt-get install -y nginx
```

创建站点配置：

```bash
sudo tee /etc/nginx/sites-available/support-chat-runtime >/dev/null <<'EOF'
server {
    listen 80;
    server_name chat.example.com;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

启用：

```bash
sudo ln -sf /etc/nginx/sites-available/support-chat-runtime /etc/nginx/sites-enabled/support-chat-runtime
sudo nginx -t
sudo systemctl reload nginx
```

TLS 可以使用 certbot、云厂商证书或已有证书方案配置。TLS 配置不在本仓库内置能力范围内。

### 9.2 Cloudflare Tunnel 示例

仓库提供示例：

```text
deploy/cloudflared/config.yml.example
```

核心内容是把域名转发到本机 bridge：

```yaml
ingress:
  - hostname: chat.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

你需要自行完成 Cloudflare 账号、tunnel 创建、credentials file 安装和 DNS 绑定。仓库只提供配置模板，不包含 Cloudflare 账号初始化流程。

## 10. 生产验收清单

部署后至少验证以下项目。

### 10.1 服务健康

```bash
curl -fsS https://chat.example.com/api/health
```

预期返回：

```json
{"ok":true,"mode":"external"}
```

### 10.2 初始化会话

```bash
curl -fsS https://chat.example.com/api/session/init \
  -H 'Content-Type: application/json' \
  -H 'x-visitor-id: visitor-prod-check-001' \
  -d '{"visitorId":"visitor-prod-check-001"}'
```

预期：

- HTTP 200。
- JSON 中 `ok` 为 `true`。
- 返回 `sessionKey`。

### 10.3 发送消息

```bash
curl -fsS https://chat.example.com/api/chat \
  -H 'Content-Type: application/json' \
  -H 'x-visitor-id: visitor-prod-check-001' \
  -d '{"visitorId":"visitor-prod-check-001","message":"hello"}'
```

mock 模式下会返回固定 mock 回复。

external 模式下，是否能返回真实答案取决于你的 external backend。

### 10.4 页面验收

浏览器打开：

```text
https://chat.example.com
```

检查：

- 页面能正常加载。
- 首次打开能初始化会话。
- 发送消息后有回复。
- 刷新页面后 visitor id 仍保留在同一浏览器中。
- 手机端页面布局可用。

## 11. 数据与备份

当前 bridge 会写入 `BRIDGE_DATA_DIR`：

- `visitor-sessions.json`：visitor id 到 session key 的映射。
- `mock-transcripts.json`：仅 mock 模式下的本地聊天记录。
- experimental 相关 transcript 文件：仅实验链路使用。

生产建议：

1. external 模式下，真实聊天记录由你的后端保存，不应依赖 bridge 的 mock transcript。
2. `BRIDGE_DATA_DIR` 至少要定期备份 `visitor-sessions.json`，否则匿名访客与 session key 的映射会丢失。
3. 如果要多实例部署，不要让多个实例同时写各自本地 JSON；应改造成共享存储或把 session 管理下沉到 external backend。

## 12. 安全建议

当前仓库只提供通用 runtime 骨架，不内置完整安全平台能力。生产建议：

- 在反向代理或网关加请求大小限制。
- 在网关或后端加 IP/visitor 粒度限流。
- 对 external backend 做鉴权或内网隔离。
- 不要把 `.env`、`/etc/default/support-chat-runtime` 或任何 token 提交到 git。
- 如果开放到公网，启用 HTTPS。
- 如果需要合规审计，external backend 应记录必要审计日志。
- 如果需要屏蔽恶意内容，应在 external backend 或模型调用层实现输入过滤。

## 13. 升级与回滚

推荐每次升级按以下流程：

```bash
cd /opt/support-chat-runtime
git fetch origin
git checkout main
git pull --ff-only

cd frontend
npm ci
npm run build

cd ../bridge
npm ci
npm test

sudo systemctl restart support-chat-runtime
curl -fsS http://127.0.0.1:8787/api/health
```

回滚到上一个 commit：

```bash
cd /opt/support-chat-runtime
git log --oneline -5
git checkout <previous-good-commit>

cd frontend
npm ci
npm run build

cd ../bridge
npm ci
npm test

sudo systemctl restart support-chat-runtime
curl -fsS http://127.0.0.1:8787/api/health
```

如果你把项目作为长期生产服务运行，建议在升级前备份：

```bash
sudo tar -czf /tmp/support-chat-runtime-data-backup.tgz /var/lib/support-chat-runtime
```

## 14. 排障

### 14.1 `/api/health` 不通

检查服务状态：

```bash
sudo systemctl status support-chat-runtime --no-pager
journalctl -u support-chat-runtime -n 100 --no-pager
```

检查端口：

```bash
curl -v http://127.0.0.1:8787/api/health
```

### 14.2 页面能打开，但发送消息失败

检查浏览器 Network 面板里的 `/api/chat` 返回。

- 400：通常是 `visitorId` 或 `message` 不合法。
- 502：通常是 external backend 不可用、超时或返回了非预期 JSON。

检查后端配置：

```bash
sudo systemctl show support-chat-runtime --property=Environment
cat /etc/default/support-chat-runtime
```

不要在公开工单或截图中泄露真实 backend URL、token 或内部域名。

### 14.3 external 模式历史记录为空

检查你的 `BACKEND_HISTORY_URL` 是否按契约返回：

```json
{
  "ok": true,
  "messages": [
    { "role": "user", "text": "...", "timestamp": 1710000000000 }
  ]
}
```

也可以返回 `history` 或 `transcript` 字段。bridge 会过滤掉没有 `role=user|assistant` 或没有文本内容的条目。

## 15. 已实现与待二次开发总表

### 已实现，可直接部署验证

- React/Vite 前端构建。
- Node/Express bridge。
- 静态文件托管。
- `/api/health`。
- `/api/session/init`。
- `/api/chat`。
- `/api/history`。
- mock 模式本地会话和回复。
- external 模式 HTTP 转发。
- systemd 模板。
- Cloudflare Tunnel 配置模板。
- 基础 smoke test。

### 仅模板、实验或需要二次开发

- 真实客服/AI 后端。
- 生产级数据库持久化。
- 多实例共享 session 存储。
- 鉴权、租户、后台管理。
- 限流、风控、验证码。
- 流式输出。
- 指标、告警、审计平台。
- external backend 认证头注入。
- Cloudflare 账号和 tunnel 初始化自动化。
- 完整 Nginx TLS 证书自动化。
- 实验链路转正所需的稳定性、审计和回归体系。

## 16. 最小生产路径建议

如果要尽快上线真实客服入口，推荐顺序：

1. 先按 mock 模式部署，验证域名、TLS、systemd、前端静态文件和 API 都正常。
2. 实现自己的 external backend，严格按 `docs/backend-contract.md` 返回 chat/history JSON。
3. 切换 `BRIDGE_MODE=external`，配置 `BACKEND_CHAT_URL` 和 `BACKEND_HISTORY_URL`。
4. 在网关或后端补齐鉴权、限流、日志和持久化。
5. 做一次完整验收后再开放给真实用户。

不要把 mock 模式当成真实客服生产后端；它只是部署链路和界面验证工具。
