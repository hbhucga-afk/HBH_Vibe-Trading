"""Quick launcher for Vibe-Trading. Run: python run.py"""
import subprocess, sys, time, webbrowser, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
AGENT = ROOT / "agent"


def cleanup():
    """Kill processes on our ports using PowerShell."""
    if sys.platform != "win32":
        return
    try:
        subprocess.run([
            "powershell", "-Command",
            "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |"
            " Where-Object { $_.LocalPort -in 5001,5899,8899 } |"
            " ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
        ], timeout=10, capture_output=True)
    except Exception:
        pass
    time.sleep(1)


def wait_for(url, timeout=20):
    """Poll URL until it responds 200, or timeout."""
    import urllib.request
    for _ in range(timeout):
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def main():
    cleanup()

    procs = []

    # 1. Market data server
    print("[1/3] Market server (port 5001)...", end=" ", flush=True)
    procs.append(subprocess.Popen(
        [sys.executable, str(ROOT / "market_server.py")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "FLASK_DEBUG": "0"},
    ))
    print("OK" if wait_for("http://127.0.0.1:5001/api/market/indices", 10) else "timeout")

    # 2. Backend API server
    print("[2/3] Backend API (port 8899)...", end=" ", flush=True)
    procs.append(subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api_server:app",
         "--host", "127.0.0.1", "--port", "8899", "--log-level", "warning"],
        cwd=str(AGENT),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "PYTHONPATH": str(AGENT)},
    ))
    print("OK" if wait_for("http://127.0.0.1:8899/health", 20) else "timeout")

    # 3. Frontend dev server
    print("[3/3] Frontend (port 5899)...", end=" ", flush=True)
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    procs.append(subprocess.Popen(
        [npx, "vite", "--host", "0.0.0.0", "--port", "5899"],
        cwd=str(FRONTEND),
    ))
    print("OK" if wait_for("http://127.0.0.1:5899/", 15) else "timeout")

    # Open browser
    webbrowser.open("http://localhost:5899")

    print(f"\n  Frontend : http://localhost:5899")
    print(f"  Backend  : http://localhost:8899")
    print(f"  Market   : http://localhost:5001")
    print(f"  Ctrl+C to stop\n")

    try:
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        for p in procs:
            p.kill()


if __name__ == "__main__":
    main()
