#!/usr/bin/env python3
import json
import os
import subprocess
import sys

DEFAULT_REPLY = os.environ.get('EXPERIMENTAL_DEFAULT_REPLY', 'Experimental route is connected, but no real helper command is configured yet.')
TIMEOUT_SECONDS = int(os.environ.get('EXPERIMENTAL_TIMEOUT_SECONDS', '60'))
SUPPORT_CMD = os.environ.get('EXPERIMENTAL_SUPPORT_CMD', '').strip()


def extract_reply(output: str) -> str:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    return '\n'.join(lines).strip() or DEFAULT_REPLY


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or '{}')
    except json.JSONDecodeError as exc:
        print(json.dumps({'ok': False, 'reply': DEFAULT_REPLY, 'error': f'invalid json: {exc}'}))
        return 0

    message = str(payload.get('message') or '').strip()
    session_key = str(payload.get('sessionKey') or '').strip()
    if not message:
        print(json.dumps({'ok': False, 'reply': DEFAULT_REPLY, 'error': 'missing message'}))
        return 0

    if not SUPPORT_CMD:
        print(json.dumps({'ok': True, 'reply': DEFAULT_REPLY}))
        return 0

    env = dict(os.environ)
    env['SUPPORT_MESSAGE'] = message
    env['SUPPORT_SESSION_KEY'] = session_key

    try:
        proc = subprocess.run(
            ['bash', '-lc', SUPPORT_CMD],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=TIMEOUT_SECONDS,
            env=env,
            check=False,
        )
    except subprocess.TimeoutExpired:
        print(json.dumps({'ok': False, 'reply': 'Experimental route timed out.', 'error': f'Timeout after {TIMEOUT_SECONDS}s'}))
        return 0
    except Exception as exc:
        print(json.dumps({'ok': False, 'reply': DEFAULT_REPLY, 'error': str(exc)}))
        return 0

    if proc.returncode != 0:
        print(json.dumps({'ok': False, 'reply': DEFAULT_REPLY, 'error': (proc.stderr or f'Process exited with code {proc.returncode}').strip()}))
        return 0

    print(json.dumps({'ok': True, 'reply': extract_reply(proc.stdout)}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
