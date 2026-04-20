# Support Chat Runtime

A private, genericized starter repository for an anonymous web support chat runtime.

What is included:
- frontend/ — responsive web chat UI for desktop and mobile
- bridge/ — lightweight Node bridge with visitor/session mapping
- deploy/ — example systemd and Cloudflare Tunnel templates
- ops/ — read-only operational scripts for usage export, knowledge sync wrappers, and raw chat-record capture

Design goals:
- anonymous visitors can start chatting immediately
- each visitor gets an isolated long-lived session key
- production runtime and experimental runtime stay isolated
- ops scripts write to ops-output/ instead of runtime data directories
- no business-specific branding or internal product paths remain in this repo

## Runtime modes

bridge/src/server.js supports two main paths:
1. Primary runtime: /api/chat and /api/history
2. Experimental runtime: /api/chat/experimental and /api/history/experimental

Primary runtime modes:
- mock — local transcript file only, safest default for demos
- external — proxy to your own backend HTTP endpoints

Experimental runtime:
- calls a configurable helper script/command and stores transcripts separately

## Quick start

1. Frontend build

```bash
cd frontend
npm install
npm run build
```

2. Bridge start

```bash
cd ../bridge
cp .env.example .env
npm install
npm run start
```

Then open http://127.0.0.1:8787

## Config

Key bridge env vars:
- PORT
- BRIDGE_MODE=mock|external
- MOCK_ASSISTANT_NAME
- BACKEND_CHAT_URL
- BACKEND_HISTORY_URL
- BACKEND_TIMEOUT_MS
- BRIDGE_DATA_DIR
- FRONTEND_DIST_DIR
- EXPERIMENTAL_HELPER_SCRIPT
- EXPERIMENTAL_HANDLER_TIMEOUT_MS
- EXPERIMENTAL_SUPPORT_CMD

## Ops

- ops/export_webchat_usage.py — export usage summary from the live bridge API
- ops/sync_knowledge_docs.sh — wrapper around any external knowledge sync script
- ops/chat_records/fetch_raw_chat_records.py — capture raw Feishu/Lark message payloads locally

## Notes

This repository is intentionally private-first. It is structured so product-specific adapters, branding, and internal documentation can be added or removed cleanly before any future open-source release.
