# Private Repo Prep Notes

This repository was assembled as a genericized extraction of a production support-chat workflow.

Included:
- anonymous web chat frontend
- lightweight bridge service
- isolated experimental route pattern
- ops wrappers for usage export, knowledge sync, and raw chat-record capture

Explicitly removed or generalized:
- business branding
- prior product-specific wording
- product-specific knowledge-routing rules
- hardcoded internal service paths
- production-only support copy

Recommended next steps before publishing publicly:
1. replace any remaining environment-specific absolute paths
2. add a generic backend adapter package if you want non-mock primary mode to be turnkey
3. add tests around the external backend contract
4. document the expected payload format for BACKEND_CHAT_URL and BACKEND_HISTORY_URL
