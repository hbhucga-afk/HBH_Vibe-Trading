"""Gold data loader for Shanghai Gold Exchange (SGE).

Workflow:
  1. Run `download_sge_data()` to scrape SGE website and save to local JSON files
  2. The API reads from local cached data via `load_sge_data()`
  3. tushare is used as an optional premium data source (requires token + 2000 points)

Local data is stored per-contract as JSON, accumulating history over time.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

LOCAL_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sge"
LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

SGE_GOLD_CODES = {
    "Au99.95": "黄金9995",
    "Au99.99": "黄金9999",
    "Au(T+D)": "黄金延期",
    "Au(T+N1)": "黄金T+N1",
    "Au(T+N2)": "黄金T+N2",
    "Au100g": "100克金条",
    "mAu(T+D)": "迷你黄金延期",
    "iAu99.99": "国际板黄金9999",
    "PGC30g": "熊猫金币30克",
    "NYAuTN06": "沪纽金AuTN06",
    "NYAuTN12": "沪纽金AuTN12",
}

SGE_BASE_URL = "https://www.sge.com.cn/sjzx"
_QUOTATION_URL = f"{SGE_BASE_URL}/quotation_daily_new"

# In-memory TTL cache (5 minutes)
_CACHE_TTL = 300
_cache: dict[str, tuple[float, list[dict]]] = {}


# ---------------------------------------------------------------------------
# Local file storage
# ---------------------------------------------------------------------------


def _local_file(contract: str) -> Path:
    safe = contract.replace("/", "_").replace("(", "").replace(")", "").replace("+", "_")
    return LOCAL_DATA_DIR / f"{safe}.json"


def _load_local_file(contract: str) -> list[dict]:
    path = _local_file(contract)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to read %s: %s", path, e)
    return []


def _save_local_file(contract: str, data: list[dict]) -> None:
    path = _local_file(contract)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _merge_bars(existing: list[dict], new_bars: list[dict]) -> list[dict]:
    """Merge new bars into existing data, deduplicating by (time, code)."""
    seen = {(b.get("time", ""), b.get("code", "")): i for i, b in enumerate(existing)}
    for bar in new_bars:
        key = (bar.get("time", ""), bar.get("code", ""))
        if key in seen:
            existing[seen[key]] = bar  # update
        else:
            existing.append(bar)
    existing.sort(key=lambda b: (b.get("time", ""), b.get("code", "")))
    return existing


# ---------------------------------------------------------------------------
# Selenium web scraper (from 黄金历史数据.py)
# ---------------------------------------------------------------------------


def scrape_sge_website(contract: str = "", target_date: str = "") -> list[dict]:
    """Scrape SGE daily quotation data from sge.com.cn via Selenium.

    Uses the correct API page: /sjzx/quotation_daily_new?start_date=&end_date=

    Returns list of PriceBar-compatible dicts with fields:
    time, open, high, low, close, volume, amount, change, pct_change, code, source.
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
    except ImportError:
        logger.warning("selenium or webdriver-manager not installed")
        return []

    if not target_date:
        target_date = datetime.now().strftime("%Y-%m-%d")

    url = f"{_QUOTATION_URL}?start_date={target_date}&end_date={target_date}"

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--log-level=3")

    driver = None
    try:
        service = webdriver.EdgeService(EdgeChromiumDriverManager().install())
        driver = webdriver.Edge(service=service, options=options)
        driver.get(url)
        time.sleep(6)

        # Header columns are in <thead><tr><th>...</th></tr></thead>
        header: list[str] = []
        try:
            thead = driver.find_element(By.TAG_NAME, "thead")
            ths = thead.find_elements(By.TAG_NAME, "th")
            header = [t.text.strip().replace("\n", "") for t in ths]
        except Exception:
            pass

        if not header:
            logger.warning("Could not find table header on SGE page")
            return []

        # Data rows are in <tbody><tr><td>...</td></tr></tbody>
        tbody = driver.find_element(By.TAG_NAME, "tbody")
        rows = tbody.find_elements(By.TAG_NAME, "tr")

        bars = []
        for row in rows:
            cells = row.find_elements(By.TAG_NAME, "td")
            row_data = [c.text.strip() for c in cells]
            if len(row_data) < len(header):
                continue

            bar = _parse_sge_row(row_data)
            if not bar:
                continue
            if contract and contract not in bar.get("code", ""):
                continue
            bars.append(bar)

        logger.info("Scraped %d bars from SGE for %s", len(bars), target_date)
        return bars

    except Exception as e:
        logger.warning("Selenium scraper failed: %s", e)
        return []
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def _parse_sge_row(cells: list[str]) -> dict | None:
    """Parse a single SGE data row into PriceBar format.

    Column mapping (from thead headers):
      0: 日期 (date)
      1: 合约 (contract code)
      2: 开盘价 (open)
      3: 最高价 (high)
      4: 最低价 (low)
      5: 收盘价 (close)
      6: 涨跌额(元) (change)
      7: 涨跌幅 (pct_change)
      8: 加权平均价 (weighted avg)
      9: 成交量(kg) (volume)
      10: 成交金额(元) (amount)
      11: 市场持仓(手) (open interest)
      12: 交收方向 (settlement direction)
      13: 交收量(手) (settlement volume)
    """
    if len(cells) < 11:
        return None

    code = cells[1].strip()
    if not code:
        return None

    date_str = cells[0].strip()

    def _num(val: str) -> float:
        try:
            return float(val.replace(",", ""))
        except (ValueError, TypeError):
            return 0.0

    open_ = _num(cells[2])
    high = _num(cells[3])
    low = _num(cells[4])
    close = _num(cells[5])

    if close == 0 and open_ == 0 and high == 0 and low == 0:
        return None  # skip rows with no trading data

    return {
        "time": date_str,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": _num(cells[9]),
        "amount": _num(cells[10]),
        "change": _num(cells[6]),
        "pct_change": _num(cells[7].replace("%", "")),
        "code": code,
        "source": "sge_web",
    }


# ---------------------------------------------------------------------------
# Download and cache workflow
# ---------------------------------------------------------------------------


def download_sge_data(contract: str = "", target_date: str = "") -> dict[str, int]:
    """Scrape SGE website and save data to local JSON files.

    Args:
        contract: Filter by contract code, or empty for all.
        target_date: Date to fetch (YYYY-MM-DD), defaults to today.

    Returns a dict mapping contract codes to the number of bars stored.
    """
    if not target_date:
        target_date = datetime.now().strftime("%Y-%m-%d")

    bars = scrape_sge_website(contract, target_date)

    if not bars:
        logger.warning("No data scraped from SGE website for %s", target_date)
        return {}

    return _save_bars(bars)


def download_sge_data_range(
    start_date: str,
    end_date: str = "",
    contract: str = "",
) -> dict[str, int]:
    """Download SGE data for a date range. Includes a delay between requests."""
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    all_results: dict[str, int] = {}
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        # Skip weekends (Saturday=5, Sunday=6)
        if current.weekday() < 5:
            print(f"  Fetching {date_str}...", end=" ", flush=True)
            bars = scrape_sge_website(contract, date_str)
            if bars:
                result = _save_bars(bars)
                total = sum(result.values())
                print(f"OK ({total} contracts)")
                for code, count in result.items():
                    all_results[code] = max(all_results.get(code, 0), count)
            else:
                print("no data")
            time.sleep(2)  # be polite to the server
        else:
            print(f"  Skipping {date_str} (weekend)")
        current += timedelta(days=1)

    return all_results


def _save_bars(bars: list[dict]) -> dict[str, int]:
    """Group bars by contract and save to local JSON files."""
    by_contract: dict[str, list[dict]] = {}
    for bar in bars:
        code = bar.get("code", "unknown")
        by_contract.setdefault(code, []).append(bar)

    result = {}
    for code, new_bars in by_contract.items():
        existing = _load_local_file(code)
        merged = _merge_bars(existing, new_bars)
        _save_local_file(code, merged)
        result[code] = len(merged)
        logger.info("Saved %s: %d bars (added %d)", code, len(merged), len(new_bars))

    return result


# ---------------------------------------------------------------------------
# Read API (used by market_server)
# ---------------------------------------------------------------------------


def load_sge_data(
    contract: str = "Au99.99",
    start_date: str = "",
    end_date: str = "",
) -> list[dict]:
    """Load SGE gold data from local cache. Returns PriceBar-compatible list.

    If local cache is empty, returns empty list (call download_sge_data first).
    """
    cache_key = f"local:{contract}:{start_date}:{end_date}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    all_bars = _load_local_file(contract)
    if not all_bars:
        return []

    # Filter by date range
    if start_date:
        all_bars = [b for b in all_bars if b.get("time", "") >= start_date]
    if end_date:
        all_bars = [b for b in all_bars if b.get("time", "") <= end_date]

    _cache_set(cache_key, all_bars)
    return all_bars


def list_available_contracts() -> list[dict]:
    """List contracts that have local data cached."""
    result = []
    for f in sorted(LOCAL_DATA_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            count = len(data) if isinstance(data, list) else 0
            # Read actual contract code from the data
            code = data[0].get("code", f.stem) if count > 0 else f.stem
        except Exception:
            code = f.stem
            count = 0
        name = SGE_GOLD_CODES.get(code, code)
        result.append({"code": code, "name": name, "bars": count})
    return result


def get_latest_price(contract: str = "Au99.99") -> dict | None:
    """Get the most recent price bar for a contract from local cache."""
    bars = load_sge_data(contract)
    return bars[-1] if bars else None


# ---------------------------------------------------------------------------
# tushare source (optional, requires token)
# ---------------------------------------------------------------------------


def _get_tushare_token() -> str | None:
    token = os.environ.get("TUSHARE_TOKEN", "").strip()
    if not token or token == "your-tushare-token":
        try:
            import tushare as ts
            token = ts.get_token()
        except Exception:
            pass
    return token or None


def fetch_sge_daily_tushare(
    contract: str = "Au99.99",
    start_date: str = "",
    end_date: str = "",
) -> list[dict]:
    """Fetch SGE gold data via tushare API (requires token + 2000 points).
    Also saves to local cache.
    """
    token = _get_tushare_token()
    if not token:
        return []

    try:
        import tushare as ts
        pro = ts.pro_api(token)
    except Exception as e:
        logger.warning("tushare init failed: %s", e)
        return []

    if not end_date:
        end_date = datetime.now().strftime("%Y%m%d")
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

    try:
        df = pro.sge_daily(ts_code=contract, start_date=start_date, end_date=end_date)
    except Exception as e:
        logger.warning("tushare sge_daily failed: %s", e)
        return []

    if df is None or df.empty:
        return []

    bars = []
    for _, row in df.iterrows():
        bars.append({
            "time": str(row.get("trade_date", "")),
            "open": float(row.get("open", 0) or 0),
            "high": float(row.get("high", 0) or 0),
            "low": float(row.get("low", 0) or 0),
            "close": float(row.get("close", 0) or 0),
            "volume": float(row.get("vol", 0) or 0),
            "amount": float(row.get("amount", 0) or 0),
            "change": float(row.get("change", 0) or 0),
            "pct_change": float(row.get("pct_change", 0) or 0),
            "code": contract,
            "source": "tushare",
        })
    bars.sort(key=lambda b: b["time"])

    # Save to local cache
    existing = _load_local_file(contract)
    _save_local_file(contract, _merge_bars(existing, bars))

    return bars


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _cache_get(key: str) -> list[dict] | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts_val, data = entry
    if time.time() - ts_val > _CACHE_TTL:
        del _cache[key]
        return None
    return data


def _cache_set(key: str, data: list[dict]) -> None:
    _cache[key] = (time.time(), data)


def clear_cache() -> None:
    _cache.clear()


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--download":
        date = sys.argv[2] if len(sys.argv) > 2 else ""
        print(f"Downloading SGE gold data{f' for {date}' if date else ''}...")
        result = download_sge_data(target_date=date)
        if result:
            for code, count in result.items():
                print(f"  {code}: {count} bars")
            print("Done. Data saved to:", LOCAL_DATA_DIR)
        else:
            print("  No data scraped.")
    elif len(sys.argv) > 1 and sys.argv[1] == "--range":
        if len(sys.argv) < 3:
            print("Usage: python -m agent.gold_data --range START_DATE [END_DATE]")
            print("Example: python -m agent.gold_data --range 2026-05-01 2026-06-09")
            sys.exit(1)
        start = sys.argv[2]
        end = sys.argv[3] if len(sys.argv) > 3 else ""
        print(f"Downloading SGE gold data from {start} to {end or 'today'}...")
        result = download_sge_data_range(start, end)
        if result:
            total_bars = sum(result.values())
            print(f"\nDone. {len(result)} contracts, {total_bars} total bars.")
            print("Data saved to:", LOCAL_DATA_DIR)
        else:
            print("  No data scraped.")
    elif len(sys.argv) > 1 and sys.argv[1] == "--list":
        print("Local SGE data:")
        for c in list_available_contracts():
            print(f"  {c['code']} ({c['name']}): {c['bars']} bars")
    else:
        contract = sys.argv[1] if len(sys.argv) > 1 else "Au99.99"
        print(f"Loading local data for {contract}...")
        data = load_sge_data(contract)
        print(f"  Total bars: {len(data)}")
        for bar in data[-5:]:
            print(f"  {bar.get('time')}: O={bar['open']} H={bar['high']} "
                  f"L={bar['low']} C={bar['close']} V={bar.get('volume', 0)}")
