# ops/

Read-only operational helpers live here.

Principles:
- do not write into production runtime directories
- write exported artifacts into ops-output/
- prefer wrappers and adapters over hardcoded internal paths

Included:
- export_webchat_usage.py
- sync_knowledge_docs.sh
- chat_records/
