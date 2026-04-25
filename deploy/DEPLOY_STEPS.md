# Deploy Steps

## 1. Build frontend

```bash
cd frontend
npm install
npm run build
```

## 2. Start bridge locally

```bash
cd ../bridge
cp .env.example .env
npm install
npm run start
```

## 3. systemd template

Use deploy/systemd/support-agent-frontend.service as a starting point.
Replace /opt/support-agent-frontend with your actual checkout path.

## 4. Cloudflare Tunnel template

Use deploy/cloudflared/config.yml.example as a starting point.

## 5. Experimental runtime

Use deploy/systemd/support-agent-frontend-experimental.service and the matching env example.
Keep its port, data directory, and frontend dist directory isolated from the default runtime.
