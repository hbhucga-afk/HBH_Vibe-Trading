"""One-click launcher for Vibe-Trading.

Starts the market-data server + frontend dev server, then opens the browser.
Press Ctrl+C to stop everything.
"""

import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"


def _cleanup_ports() -> None:
    """Kill any processes lingering on our ports from a previous run."""
    import platform
    if platform.system() != "Windows":
        return
    try:
        subprocess.run(
            ['powershell', '-Command',
             'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | '
             'Where-Object { $_.LocalPort -in @(5001,5899,8899) } | '
             'ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'],
            timeout=10, capture_output=True,
        )
    except Exception:
        pass


def header(text: str) -> None:
    print(f"\n{'='*50}")
    print(f"  {text}")
    print(f"{'='*50}")


def step(n: int, total: int, text: str) -> None:
    print(f"\n[{n}/{total}] {text}")


def _find_nodejs() -> Path | None:
    """Locate the Node.js installation directory on Windows."""
    import os as _os
    candidates = [
        _os.environ.get("ProgramFiles", R"C:\Program Files") + R"\nodejs",
        _os.environ.get("ProgramFiles(x86)", R"C:\Program Files (x86)") + R"\nodejs",
        _os.path.expanduser(R"~\AppData\Local\hermes\node"),
    ]
    for p in candidates:
        if Path(p, "node.exe").exists():
            return Path(p)
    return None


def _find_exe(name: str) -> str:
    """Return the full path to the executable in the Node.js dir on Windows."""
    if sys.platform != "win32":
        return name
    node_dir = _find_nodejs()
    if node_dir:
        for ext in (".exe", ".cmd", ""):
            exe = node_dir / f"{name}{ext}"
            if exe.exists():
                return str(exe)
    return name


def _env_with_nodejs() -> dict:
    """Return os.environ with Node.js appended to PATH on Windows."""
    import os as _os
    env = dict(_os.environ)
    if sys.platform == "win32":
        node_dir = _find_nodejs()
        if node_dir:
            sep = ";"
            current = env.get("PATH", "")
            if str(node_dir) not in current.split(sep):
                env["PATH"] = str(node_dir) + sep + current
    return env


def run(cmd: list[str], cwd: Path | None = None, show: bool = False) -> bool:
    """Run a command; return True on success."""
    try:
        subprocess.run(cmd, cwd=cwd or ROOT, check=True,
                       stdout=None if show else subprocess.DEVNULL,
                       stderr=None if show else subprocess.DEVNULL,
                       env=_env_with_nodejs())
        return True
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError:
        print(f"  ERROR: command not found: {cmd[0]}")
        return False


# ---------------------------------------------------------------------------
def main() -> None:
    header("Vibe-Trading Launcher")

    # --- cleanup leftover processes ---
    _cleanup_ports()

    # --- 1. check prerequisites ---
    step(1, 5, "Checking Python...")
    print(f"  Python {sys.version}")

    step(2, 5, "Checking Node.js...")
    node_cmd = _find_exe("node")
    if not run([node_cmd, "--version"], show=True):
        print("  ERROR: Node.js not found. Install it from https://nodejs.org")
        try:
            input("\nPress Enter to exit...")
        except EOFError:
            pass
        sys.exit(1)

    # --- 2. install Python deps (skip if already installed) ---
    step(3, 5, "Checking Python dependencies...")
    def _pkg_installed(name: str) -> bool:
        try:
            subprocess.run([sys.executable, "-c", f"import {name.split('[')[0].split('==')[0].split('>')[0].split('<')[0].strip()}",
                          ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            return True
        except Exception:
            return False

    market_deps = ["flask", "flask_cors", "requests", "mootdx"]
    if all(_pkg_installed(d) for d in market_deps):
        print("  market-server deps: already installed.")
    else:
        run([sys.executable, "-m", "pip", "install", "-q"] + market_deps)
        print("  market-server deps: Done.")

    step(4, 5, "Checking backend dependencies...")
    backend_deps = ["fastapi", "uvicorn", "pydantic", "rich", "httpx"]
    if all(_pkg_installed(d) for d in backend_deps):
        print("  backend deps: already installed.")
    else:
        run([sys.executable, "-m", "pip", "install", "-q",
             "fastapi", "uvicorn", "pydantic", "sse-starlette", "python-multipart",
             "rich", "pyyaml", "python-dotenv", "httpx",
             "langchain", "langchain-core", "langchain-openai", "langgraph"])
        print("  backend deps: Done.")

    # --- 3. install frontend deps ---
    step(5, 5, "Checking frontend dependencies...")
    if not (FRONTEND / "node_modules").exists():
        print("  Running npm install (first time, may take 1-2 minutes)...")
        npm_cmd = _find_exe("npm")
        if not run([npm_cmd, "install"], cwd=FRONTEND, show=True):
            print("  ERROR: npm install failed. Check your Node.js and network.")
            try:
                input("\nPress Enter to exit...")
            except EOFError:
                pass
            sys.exit(1)
    print("  Done.")

    # --- 4. start services ---
    header("Starting Services")

    # Market data server (port 5001)
    print("\nStarting market data server (port 5001)...")
    market_proc = subprocess.Popen(
        [sys.executable, "market_server.py"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env={**__import__("os").environ, "PYTHONUNBUFFERED": "1"},
    )
    print("  Started.")
    print("  Waiting for market server...", end="", flush=True)
    for _ in range(15):
        try:
            import urllib.request
            urllib.request.urlopen("http://127.0.0.1:5001/api/market/indices", timeout=2)
            print(" ready!")
            break
        except Exception:
            print(".", end="", flush=True)
            time.sleep(1)
    else:
        print(" (continuing anyway)")

    # Main backend server (port 8899)
    print("\nStarting backend server (port 8899)...")
    agent_dir = ROOT / "agent"
    backend_log = ROOT / "backend.log"
    backend_log_fh = open(backend_log, "w", encoding="utf-8")
    backend_proc = subprocess.Popen(
        [sys.executable, "-c",
         "import cli, sys; raise SystemExit(cli.main(sys.argv[1:]))",
         "serve", "--host", "127.0.0.1", "--port", "8899"],
        cwd=ROOT,
        stdout=backend_log_fh,
        stderr=backend_log_fh,
        env={**__import__("os").environ, "PYTHONPATH": str(agent_dir), "PYTHONUNBUFFERED": "1"},
    )
    backend_log_fh.close()
    print("  Started.")
    # Wait for backend to be ready (preflight checks can be slow)
    print("  Waiting for backend...", end="", flush=True)
    for _ in range(30):
        if backend_proc.poll() is not None:
            print(f" FAILED (exit code {backend_proc.returncode})")
            print(f"  Check {backend_log} for details.")
            break
        try:
            import urllib.request
            urllib.request.urlopen("http://127.0.0.1:8899/health", timeout=2)
            print(" ready!")
            break
        except Exception:
            print(".", end="", flush=True)
            time.sleep(1)
    else:
        print(" (continuing anyway)")

    # Frontend (port 5899)
    print("\nStarting frontend dev server (port 5899)...")
    npx_cmd = _find_exe("npx")
    frontend_proc = subprocess.Popen(
        [npx_cmd, "vite", "--host", "0.0.0.0", "--port", "5899"],
        cwd=FRONTEND,
        env=_env_with_nodejs(),
    )
    time.sleep(2)

    # Open browser
    webbrowser.open("http://localhost:5899")

    print(f"\n{'='*50}")
    print(f"  Frontend : http://localhost:5899")
    print(f"  Backend  : http://localhost:8899")
    print(f"  Market   : http://localhost:5001")
    print(f"  Press Ctrl+C to stop all services")
    print(f"{'='*50}\n")

    try:
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        for proc in [market_proc, backend_proc, frontend_proc]:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        print("All services stopped.")


if __name__ == "__main__":
    main()
