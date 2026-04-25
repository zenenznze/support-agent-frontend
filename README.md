# Support Chat Runtime

一个面向匿名网页客服场景的通用运行时骨架仓库，可作为公开发布与二次开发的基础。

包含内容：
- `frontend/`：适配桌面端与移动端的网页聊天前端
- `bridge/`：轻量 Node.js bridge 服务，负责访客 ID、会话映射与接口转发
- `deploy/`：systemd 与 Cloudflare Tunnel 示例模板
- `ops/`：只读运维脚本，包括使用统计导出、知识库同步包装脚本、原始聊天记录抓取
- `docs/`：公开发布检查清单与外部后端接口约定

设计目标：
- 匿名访客打开网页即可开始聊天
- 每个访客拥有独立且可长期复用的会话 key
- 正式运行链路与实验链路彼此隔离
- ops 脚本统一写入 `ops-output/`，不直接污染运行时数据目录
- 仓库中不保留业务品牌词、内部产品专用路径或生产凭证

## 运行模式

`bridge/src/server.js` 支持两条主路径：

1. 主运行链路：`/api/chat` 与 `/api/history`
2. 实验链路：`/api/chat/experimental` 与 `/api/history/experimental`

主运行链路支持两种模式：

- `mock`：仅写本地会话记录，适合演示和本地调试
- `external`：转发到你自己的后端 HTTP 接口

实验链路：

- 调用可配置的辅助脚本或命令
- 与主链路分开存储会话数据

## 快速开始

1. 构建前端

```bash
cd frontend
npm install
npm run build
```

2. 启动 bridge

```bash
cd ../bridge
cp .env.example .env
npm install
npm run start
```

启动后可访问：

```text
http://127.0.0.1:8787
```

健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

## 配置项

bridge 侧常用环境变量：

- `PORT`
- `BRIDGE_MODE=mock|external`
- `MOCK_ASSISTANT_NAME`
- `BACKEND_CHAT_URL`
- `BACKEND_HISTORY_URL`
- `BACKEND_TIMEOUT_MS`
- `BRIDGE_DATA_DIR`
- `FRONTEND_DIST_DIR`
- `EXPERIMENTAL_HELPER_SCRIPT`
- `EXPERIMENTAL_HANDLER_TIMEOUT_MS`
- `EXPERIMENTAL_SUPPORT_CMD`

外部后端接口约定见：`docs/backend-contract.md`

## 运维脚本

- `ops/export_webchat_usage.py`：从 bridge API 导出使用情况汇总
- `ops/sync_knowledge_docs.sh`：包装外部知识库同步脚本
- `ops/chat_records/fetch_raw_chat_records.py`：本地抓取 Feishu/Lark 原始消息载荷

## 发布状态

这个仓库已经完成原始业务品牌与运行时耦合的剥离，当前定位是“可公开发布的通用客服聊天运行时骨架”。

公开发布前检查清单见：`docs/public-release-checklist.md`

## License

MIT. See `LICENSE`.
