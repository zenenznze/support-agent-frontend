#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch raw Feishu/Lark chat messages into local JSON files only.")
    parser.add_argument("--chat-id", help="chat_id, e.g. oc_xxx")
    parser.add_argument("--chat-name", help="local output directory name")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--page-token", default="")
    parser.add_argument("--as", dest="identity", default="bot", choices=["bot", "user"])
    parser.add_argument("--config", help="JSON config for batch fetch")
    parser.add_argument("--output-dir", default="ops-output/feishu-chat-records")
    return parser.parse_args()


def run_cmd(command):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"command failed: {' '.join(command)}")
    return result.stdout


def ensure_lark_cli():
    direct = shutil.which('lark-cli')
    if direct:
        return direct
    shell = 'command -v lark-cli || true'
    path_output = run_cmd(['bash', '-lc', shell]).strip()
    if not path_output:
        raise RuntimeError('lark-cli not found in PATH')
    return path_output


def fetch_one(job, output_root: Path, lark_cli_path: str):
    chat_id = job['chat_id']
    chat_name = job.get('name') or chat_id
    identity = job.get('as', 'bot')
    page_size = int(job.get('page_size', 50))
    page_token = job.get('page_token', '')

    params = {
        'container_id_type': 'chat',
        'container_id': chat_id,
        'page_size': page_size,
        'sort_type': 'ByCreateTimeDesc',
    }
    if page_token:
        params['page_token'] = page_token

    stdout = run_cmd([
        lark_cli_path,
        'api', 'GET', '/open-apis/im/v1/messages',
        '--as', identity,
        '--params', json.dumps(params, ensure_ascii=False),
    ])
    payload = json.loads(stdout)

    target_dir = output_root / chat_name
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime('%Y-%m-%d_%H%M%S')
    dated_path = target_dir / f'{stamp}.json'
    latest_path = target_dir / 'latest.json'

    envelope = {
        'generated_at': datetime.now().astimezone().isoformat(),
        'chat_id': chat_id,
        'chat_name': chat_name,
        'identity': identity,
        'request': params,
        'response': payload,
    }
    text = json.dumps(envelope, ensure_ascii=False, indent=2) + '\n'
    dated_path.write_text(text, encoding='utf-8')
    latest_path.write_text(text, encoding='utf-8')
    return {
        'chat_id': chat_id,
        'chat_name': chat_name,
        'output': str(dated_path),
        'has_more': payload.get('data', {}).get('has_more'),
        'page_token': payload.get('data', {}).get('page_token'),
    }


def load_jobs(args):
    if args.config:
        return json.loads(Path(args.config).read_text(encoding='utf-8'))
    if not args.chat_id:
        raise SystemExit('provide --chat-id or --config')
    return [{
        'chat_id': args.chat_id,
        'name': args.chat_name or args.chat_id,
        'as': args.identity,
        'page_size': args.page_size,
        'page_token': args.page_token,
    }]


def main():
    args = parse_args()
    jobs = load_jobs(args)
    output_root = Path(args.output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    lark_cli_path = ensure_lark_cli()

    results = []
    for job in jobs:
        results.append(fetch_one(job, output_root, lark_cli_path))

    print(json.dumps({'ok': True, 'results': results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
