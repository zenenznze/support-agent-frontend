#!/usr/bin/env python3
import argparse
import json
import statistics
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

TZ = timezone.utc


def parse_args():
    parser = argparse.ArgumentParser(description="Export webchat usage summary and raw transcripts without touching production runtime.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787", help="bridge base URL")
    parser.add_argument(
        "--mappings-file",
        default="bridge/data/visitor-sessions.json",
        help="visitor -> sessionKey mapping file",
    )
    parser.add_argument(
        "--output-dir",
        default="ops-output/webchat-usage",
        help="directory for summary/transcript output",
    )
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds")
    parser.add_argument("--limit", type=int, default=1000, help="max history items per visitor")
    parser.add_argument("--date", default=None, help="override output date prefix, e.g. 2026-04-20")
    return parser.parse_args()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch_history(base_url: str, visitor_id: str, limit: int, timeout: int):
    query = urllib.parse.urlencode({"visitorId": visitor_id, "limit": limit})
    url = f"{base_url.rstrip('/')}/api/history?{query}"
    req = urllib.request.Request(url, headers={"x-visitor-id": visitor_id})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(payload)
    return payload.get("history") or payload.get("messages") or []


def iso_date(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=TZ).astimezone().strftime("%Y-%m-%d")


def hour_of(ms: int) -> int:
    return int(datetime.fromtimestamp(ms / 1000, tz=TZ).astimezone().strftime("%H"))


def pct(values, p):
    if not values:
        return 0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round((p / 100) * (len(ordered) - 1))))
    return ordered[idx]


def summarize(records):
    daily = defaultdict(lambda: {
        "unique_visitors": set(),
        "day_slices": 0,
        "user_messages": 0,
        "assistant_messages": 0,
        "total_messages": 0,
        "rounds": [],
        "active_minutes": [],
    })
    hour_counter = Counter()
    non_empty = 0
    all_rounds = []
    all_minutes = []

    for record in records:
        history = record["history"]
        if history:
            non_empty += 1
        buckets = defaultdict(list)
        for item in history:
            ts = int(item.get("timestamp") or 0)
            if ts <= 0:
                continue
            buckets[iso_date(ts)].append(item)
            if item.get("role") == "user":
                hour_counter[hour_of(ts)] += 1

        for day, items in buckets.items():
            items.sort(key=lambda x: int(x.get("timestamp") or 0))
            user_count = sum(1 for item in items if item.get("role") == "user")
            assistant_count = sum(1 for item in items if item.get("role") == "assistant")
            active_minutes = round((int(items[-1].get("timestamp") or 0) - int(items[0].get("timestamp") or 0)) / 60000, 2)
            summary = daily[day]
            summary["unique_visitors"].add(record["visitorId"])
            summary["day_slices"] += 1
            summary["user_messages"] += user_count
            summary["assistant_messages"] += assistant_count
            summary["total_messages"] += len(items)
            summary["rounds"].append(user_count)
            summary["active_minutes"].append(active_minutes)
            all_rounds.append(user_count)
            all_minutes.append(active_minutes)

    daily_output = []
    for day in sorted(daily):
        item = daily[day]
        rounds = item["rounds"]
        minutes = item["active_minutes"]
        daily_output.append({
            "date": day,
            "unique_visitors": len(item["unique_visitors"]),
            "day_slices": item["day_slices"],
            "user_messages": item["user_messages"],
            "assistant_messages": item["assistant_messages"],
            "total_messages": item["total_messages"],
            "avg_rounds": round(statistics.mean(rounds), 2) if rounds else 0,
            "median_rounds": statistics.median(rounds) if rounds else 0,
            "avg_active_minutes": round(statistics.mean(minutes), 2) if minutes else 0,
            "median_active_minutes": statistics.median(minutes) if minutes else 0,
        })

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "mapped_visitors": len(records),
        "non_empty_histories": non_empty,
        "daily": daily_output,
        "overall": {
            "day_slices": len(all_rounds),
            "avg_rounds": round(statistics.mean(all_rounds), 2) if all_rounds else 0,
            "median_rounds": statistics.median(all_rounds) if all_rounds else 0,
            "p90_rounds": pct(all_rounds, 90),
            "avg_active_minutes": round(statistics.mean(all_minutes), 2) if all_minutes else 0,
            "median_active_minutes": statistics.median(all_minutes) if all_minutes else 0,
            "p90_active_minutes": pct(all_minutes, 90),
        },
        "top_user_message_hours": [
            {"hour": hour, "user_messages": count}
            for hour, count in hour_counter.most_common(10)
        ],
    }


def main():
    args = parse_args()
    mappings_path = Path(args.mappings_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    store = load_json(mappings_path)
    visitors = store.get("visitors", {})
    records = []
    failures = []

    for visitor_id in sorted(visitors):
        try:
            history = fetch_history(args.base_url, visitor_id, args.limit, args.timeout)
            records.append({
                "visitorId": visitor_id,
                "sessionKey": visitors[visitor_id].get("sessionKey"),
                "history": history,
            })
        except Exception as exc:  # noqa: BLE001
            failures.append({"visitorId": visitor_id, "error": str(exc)})

    summary = summarize(records)
    summary["failures"] = failures
    date_prefix = args.date or datetime.now().astimezone().strftime("%Y-%m-%d")
    summary_path = output_dir / f"{date_prefix}-summary.json"
    transcripts_path = output_dir / f"{date_prefix}-transcripts.jsonl"

    with summary_path.open("w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    with transcripts_path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    result = {
        "ok": True,
        "summary_path": str(summary_path),
        "transcripts_path": str(transcripts_path),
        "mapped_visitors": len(records),
        "failed_visitors": len(failures),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
