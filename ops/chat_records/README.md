# chat_records/

Raw chat-record capture lives here.

Current scope:
- capture raw API payloads only
- no cleanup
- no summarization
- no upload step

Example:

```bash
python3 ops/chat_records/fetch_raw_chat_records.py       --chat-id oc_xxx       --chat-name support-group       --as bot
```

Outputs go to ops-output/feishu-chat-records/ by default.
