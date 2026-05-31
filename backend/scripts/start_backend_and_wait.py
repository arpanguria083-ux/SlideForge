#!/usr/bin/env python3
"""Start backend (uvicorn) and wait for /api/ocr/health to respond.

Behavior:
- If health endpoint already responds, exit successfully.
- If port 8002 is LISTENING but health doesn't respond, identify the PID and kill it (if it's uvicorn/app.main:app).
- Start uvicorn with the project's venv python executable, redirect stdout/stderr to a timestamped log under `backend/logs/`.
- Poll health endpoint until success or timeout.
- On failure, print tail of log for debugging.

Intended for local dev on Windows; should also work on Linux/macOS when `netstat -ano` isn't available.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import json
from pathlib import Path
from datetime import datetime
import urllib.request


BASE = "http://127.0.0.1:8002"
HEALTH = BASE + "/api/ocr/health"
PORT = 8002


def probe_health(timeout: float = 2.0) -> dict | None:
    try:
        req = urllib.request.Request(HEALTH, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.load(r)
            return data
    except Exception:
        return None


def find_listening_pid(port: int) -> int | None:
    # Windows: netstat -ano | findstr :<port>
    try:
        out = subprocess.check_output(["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[0].upper().startswith("TCP"):
                local = parts[1]
                state = parts[3] if len(parts) >= 4 else ""
                pid = parts[-1]
                if local.endswith(f":{port}") and state.upper() == "LISTENING":
                    try:
                        return int(pid)
                    except Exception:
                        return None
    except Exception:
        pass
    return None


def get_process_cmdline_windows(pid: int) -> str | None:
    try:
        ps = [
            "powershell",
            "-NoProfile",
            "-Command",
            f"Get-CimInstance -ClassName Win32_Process -Filter \"ProcessId={pid}\" | Select-Object CommandLine | ConvertTo-Json -Compress",
        ]
        out = subprocess.check_output(ps, text=True, stderr=subprocess.DEVNULL)
        # output is JSON like {"CommandLine":"..."}
        j = json.loads(out)
        return j.get("CommandLine")
    except Exception:
        return None


def kill_pid_windows(pid: int) -> bool:
    try:
        subprocess.check_call(["taskkill", "/PID", str(pid), "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


def which_venv_python() -> str:
    repo_root = Path(__file__).resolve().parents[1]
    venv_py = repo_root / ".venv" / "Scripts" / "python.exe"
    if venv_py.exists():
        return str(venv_py)
    # fallback to whatever python runs this script
    return sys.executable


def tail_log(path: Path, lines: int = 200) -> str:
    try:
        with path.open("rb") as f:
            f.seek(0, 2)
            size = f.tell()
            block = 1024
            data = b""
            while size > 0 and lines > 0:
                toread = min(block, size)
                f.seek(size - toread)
                chunk = f.read(toread)
                data = chunk + data
                size -= toread
                if data.count(b"\n") >= lines:
                    break
            text = data.decode(errors="replace")
            tail = "\n".join(text.splitlines()[-lines:])
            return tail
    except Exception as e:
        return f"<failed to read log: {e}>"


def start_uvicorn(log_path: Path, env: dict) -> subprocess.Popen:
    python = which_venv_python()
    cmd = [python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "info"]
    log_path.parent.mkdir(parents=True, exist_ok=True)
    out = open(log_path, "ab")
    p = subprocess.Popen(cmd, stdout=out, stderr=subprocess.STDOUT, env=env)
    return p


def main():
    repo_root = Path(__file__).resolve().parents[1]
    logs_dir = repo_root / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    # If backend already healthy, short-circuit
    print("Probing health endpoint...", flush=True)
    healthy = probe_health(timeout=2.0)
    if healthy is not None:
        print("Backend already responding. No action taken.")
        print(json.dumps(healthy, indent=2))
        return 0

    # If port is listening but health not responding, attempt to identify PID and kill if uvicorn
    pid = find_listening_pid(PORT)
    if pid:
        cmdline = get_process_cmdline_windows(pid)
        print(f"Port {PORT} is LISTENING by PID {pid}; cmdline={cmdline}")
        if cmdline and ("uvicorn" in cmdline or "app.main:app" in cmdline):
            print(f"Killing stale uvicorn process PID {pid}")
            killed = kill_pid_windows(pid)
            if not killed:
                print(f"Failed to kill PID {pid}; please kill manually and retry.")
                return 3
        else:
            print(f"Process on port {PORT} is not uvicorn/app.main:app; won't kill. Please free the port and retry.")
            return 4

    # Rotate old logs before starting
    def rotate_logs(dirpath: Path, keep: int = 10, max_age_days: int | None = 30) -> None:
        try:
            files = sorted(
                [p for p in dirpath.glob("uvicorn.*.log") if p.is_file()],
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            # Remove beyond keep
            for old in files[keep:]:
                try:
                    old.unlink()
                except Exception:
                    pass
            # Remove files older than max_age_days
            if max_age_days is not None:
                cutoff = time.time() - (max_age_days * 86400)
                for p in files:
                    try:
                        if p.stat().st_mtime < cutoff:
                            p.unlink()
                    except Exception:
                        pass
        except Exception:
            pass

    env = os.environ.copy()
    env.setdefault("SLIDEFORGE_OCR_DIR", str(Path.home() / ".slideforge" / "data" / "ocr_models"))

    rotate_logs(logs_dir, keep=10, max_age_days=30)

    max_attempts = 3
    attempt = 0
    last_ret = None
    while attempt < max_attempts:
        attempt += 1
        now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        log_file = logs_dir / f"uvicorn.{now}.log"

        print(f"Starting uvicorn (attempt {attempt}/{max_attempts}); log -> {log_file}")
        p = start_uvicorn(log_file, env)

        # Poll health for up to 90s
        deadline = time.time() + 90
        while time.time() < deadline:
            h = probe_health(timeout=2.0)
            if h is not None:
                print("Backend healthy:")
                print(json.dumps(h, indent=2))
                # Rotate once more to enforce retention after successful start
                rotate_logs(logs_dir, keep=10, max_age_days=30)
                return 0
            # Check if process exited
            ret = p.poll()
            if ret is not None:
                last_ret = ret
                print(f"Uvicorn process exited with code {ret}")
                print("Recent log tail:\n", tail_log(log_file, lines=200))
                # If a listener is present, try to inspect and kill stale uvicorn processes
                pid = find_listening_pid(PORT)
                if pid:
                    cmdline = get_process_cmdline_windows(pid)
                    print(f"Listener detected on port {PORT} by PID {pid}; cmdline={cmdline}")
                    if cmdline and ("uvicorn" in cmdline or "app.main:app" in cmdline):
                        print(f"Killing stale uvicorn process PID {pid}")
                        _ = kill_pid_windows(pid)
                # Backoff before retrying
                sleep_for = min(30, 2 ** attempt)
                print(f"Retrying in {sleep_for} seconds...")
                time.sleep(sleep_for)
                break
            time.sleep(1)

        else:
            # timed out waiting for health
            print("Timed out waiting for backend health; printing log tail:")
            print(tail_log(log_file, lines=400))
            # Backoff before next attempt
            sleep_for = min(30, 2 ** attempt)
            print(f"Retrying in {sleep_for} seconds...")
            time.sleep(sleep_for)

    print(f"Failed to start backend after {max_attempts} attempts; last exit code: {last_ret}")
    return 6


if __name__ == "__main__":
    sys.exit(main())
