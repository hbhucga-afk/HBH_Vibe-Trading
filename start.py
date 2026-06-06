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
    for port in ("5001", "5899"):
        try:
            result = subprocess.run(
                f'netstat -ano | findstr :{port} | findstr LISTENING',
                shell=True, capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.strip().splitlines():
                parts = line.split()
                pid = parts[-1] if parts else None
                if pid and pid.isdigit():
                    subprocess.run(
                        f"taskkill /f /pid {pid}",
                        shell=True, capture_output=True, timeout=5,
                    )
        except Exception:
            pass


def header(text: str) -> None:
    print(f"\n{'='*50}")
    print(f"  {text}")
    print(f"{'='*50}")


def step(n: int, total: int, text: str) -> None:
    print(f"\n[{n}/{total}] {text}")


def run(cmd: list[str], cwd: Path | None = None, show: bool = False) -> bool:
    """Run a command; return True on success."""
    try:
        subprocess.run(cmd, cwd=cwd or ROOT, check=True,
                       stdout=None if show else subprocess.DEVNULL,
                       stderr=None if show else subprocess.DEVNULL)
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
    step(1, 4, "Checking Python...")
    print(f"  Python {sys.version}")

    step(2, 4, "Checking Node.js...")
    if not run(["node", "--version"], show=True):
        print("  ERROR: Node.js not found. Install it from https://nodejs.org")
        input("\nPress Enter to exit...")
        sys.exit(1)

    # --- 2. install Python deps ---
    step(3, 4, "Installing Python dependencies...")
    run([sys.executable, "-m", "pip", "install", "-q", "flask", "flask-cors", "requests"])
    print("  Done.")

    # --- 3. install frontend deps ---
    step(4, 4, "Checking frontend dependencies...")
    if not (FRONTEND / "node_modules").exists():
        print("  Running npm install (first time, may take 1-2 minutes)...")
        if not run(["npm", "install"], cwd=FRONTEND, show=True):
            print("  ERROR: npm install failed. Check your Node.js and network.")
            input("\nPress Enter to exit...")
            sys.exit(1)
    print("  Done.")

    # --- 4. start services ---
    header("Starting Services")

    # Market data server
    print("\nStarting market data server (port 5001)...")
    market_proc = subprocess.Popen(
        [sys.executable, "market_server.py"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("  Started.")

    # Wait for it
    time.sleep(2)

    # Frontend
    print("\nStarting frontend dev server (port 5899)...")
    frontend_proc = subprocess.Popen(
        "npx vite --host 0.0.0.0 --port 5899",
        cwd=FRONTEND,
        shell=True,
    )
    time.sleep(2)

    # Open browser
    webbrowser.open("http://localhost:5899")

    print(f"\n{'='*50}")
    print(f"  Frontend : http://localhost:5899")
    print(f"  Market   : http://localhost:5001")
    print(f"  Press Ctrl+C to stop all services")
    print(f"{'='*50}\n")

    try:
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        market_proc.terminate()
        frontend_proc.terminate()
        market_proc.wait()
        frontend_proc.wait()
        print("All services stopped.")


if __name__ == "__main__":
    main()
