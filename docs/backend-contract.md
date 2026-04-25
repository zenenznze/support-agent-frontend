# External Backend Contract

`BRIDGE_MODE=external` lets the bridge forward chat and history requests to a backend that you operate.

Related backend direction: [`support-agent`](https://github.com/zenenznze/support-agent) is the planned dedicated support backend repository for this frontend. Treat it as the recommended implementation direction for this contract, not as a feature built into the frontend runtime.

## Environment variables

- `BACKEND_CHAT_URL`: HTTP endpoint for sending one user message.
- `BACKEND_HISTORY_URL`: HTTP endpoint for loading conversation history.
- `BACKEND_TIMEOUT_MS`: request timeout in milliseconds. Default: `60000`.

## Chat request

The bridge sends a `POST` request to `BACKEND_CHAT_URL`.

Headers:

```http
Content-Type: application/json
x-visitor-id: <visitorId>
```

Body:

```json
{
  "visitorId": "browser-generated-visitor-id",
  "sessionKey": "support:webchat:browser-generated-visitor-id",
  "message": "User message text"
}
```

Expected JSON response:

```json
{
  "ok": true,
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "text": "User message text",
      "timestamp": 1710000000000
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "text": "Assistant reply text",
      "timestamp": 1710000001000
    }
  ]
}
```

Accepted aliases:

- `history` may be used instead of `messages`.
- `reply` may be returned as a single assistant item when no message list is available.
- Message text may be supplied as `text`, `message`, or `content`.

If the backend returns a non-2xx response or `{ "ok": false }`, the bridge returns `502` to the frontend with a generic backend-unavailable error.

## History request

The bridge sends a `GET` request to `BACKEND_HISTORY_URL` with both query parameters and the visitor header:

```http
GET /history?visitorId=<visitorId>&sessionKey=<sessionKey>
x-visitor-id: <visitorId>
```

Expected JSON response:

```json
{
  "ok": true,
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "text": "Previous user message",
      "timestamp": 1710000000000
    }
  ]
}
```

Accepted aliases:

- `history` or `transcript` may be used instead of `messages`.

## Message normalization

The bridge keeps only normalized items where:

- `role` is `user` or `assistant`.
- text content is non-empty.

This keeps frontend rendering stable even if the backend has richer internal message objects.
