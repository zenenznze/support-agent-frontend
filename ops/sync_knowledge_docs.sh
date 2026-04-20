    #!/usr/bin/env bash
    set -euo pipefail

    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    OUTPUT_DIR="$ROOT_DIR/ops-output/knowledge-sync"
    TIMESTAMP="$(date +%F_%H%M%S)"
    LOG_PATH="$OUTPUT_DIR/${TIMESTAMP}-sync.log"
    SUMMARY_PATH="$OUTPUT_DIR/${TIMESTAMP}-summary.json"

    SYNC_SCRIPT="${SYNC_SCRIPT:-}"
    SOURCE_SUMMARY_JSON="${SOURCE_SUMMARY_JSON:-}"
    SOURCE_INDEX_JSON="${SOURCE_INDEX_JSON:-}"

    mkdir -p "$OUTPUT_DIR"

    if [[ -z "$SYNC_SCRIPT" ]]; then
      echo "SYNC_SCRIPT is not set. Point it at your own knowledge-doc sync entrypoint." >&2
      exit 1
    fi

    if [[ ! -x "$SYNC_SCRIPT" ]]; then
      echo "sync script missing or not executable: $SYNC_SCRIPT" >&2
      exit 1
    fi

    {
      echo "[info] root_dir=$ROOT_DIR"
      echo "[info] sync_script=$SYNC_SCRIPT"
      echo "[info] log_path=$LOG_PATH"
      echo "[info] summary_path=$SUMMARY_PATH"
      echo "[info] sync_begin=$(date --iso-8601=seconds)"
      "$SYNC_SCRIPT"
      echo "[info] sync_end=$(date --iso-8601=seconds)"
    } | tee "$LOG_PATH"

    python3 - <<'PY' "$SUMMARY_PATH" "$SOURCE_SUMMARY_JSON" "$SOURCE_INDEX_JSON"
import json
import pathlib
import sys
from datetime import datetime

summary_path = pathlib.Path(sys.argv[1])
source_summary = pathlib.Path(sys.argv[2]) if sys.argv[2] else None
source_index = pathlib.Path(sys.argv[3]) if sys.argv[3] else None

summary = {
    "generated_at": datetime.now().astimezone().isoformat(),
    "source_summary_json": str(source_summary) if source_summary else None,
    "source_index_json": str(source_index) if source_index else None,
    "source_summary_exists": bool(source_summary and source_summary.exists()),
    "source_index_exists": bool(source_index and source_index.exists()),
}

if source_summary and source_summary.exists():
    try:
        summary["source_summary"] = json.loads(source_summary.read_text(encoding="utf-8"))
    except Exception as exc:
        summary["source_summary_error"] = str(exc)

if source_index and source_index.exists():
    try:
        payload = json.loads(source_index.read_text(encoding="utf-8"))
        summary["indexed_docs"] = len(payload.get("documents", [])) if isinstance(payload, dict) else None
    except Exception as exc:
        summary["source_index_error"] = str(exc)

summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "
", encoding="utf-8")
print(json.dumps({"ok": True, "summary_path": str(summary_path)}, ensure_ascii=False))
PY

    echo "done: $SUMMARY_PATH"
