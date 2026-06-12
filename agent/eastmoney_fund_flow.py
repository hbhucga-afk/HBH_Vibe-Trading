"""East Money industry sector fund flow data module.

Fetches industry sector (行业板块) fund flow data from East Money push2delay API.
Caches daily data to local JSON files for historical queries.

Workflow:
  1. Run ``refresh_fund_flow()`` to fetch today's data from East Money API
  2. Use ``load_fund_flow(date_str)`` to read cached data
  3. Use ``get_available_dates()`` to list dates with cached data

Local data is stored as date-stamped JSON files, accumulating history over time.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

LOCAL_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "eastmoney"
LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

API_URL = "https://push2delay.eastmoney.com/api/qt/clist/get"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://data.eastmoney.com/bkzj/hy.html",
}

# In-memory TTL cache (5 minutes)
_CACHE_TTL = 300
_cache: dict[str, tuple[float, list[dict]]] = {}


# ---------------------------------------------------------------------------
# Local file storage
# ---------------------------------------------------------------------------


def _data_file(date_str: str) -> Path:
    return LOCAL_DATA_DIR / f"{date_str}.json"


def load_date_file(date_str: str) -> dict | None:
    """Load fund flow data for a specific date from local cache."""
    filepath = _data_file(date_str)
    if not filepath.exists():
        return None
    try:
        return json.loads(filepath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_date_file(date_str: str, data: dict) -> None:
    """Save fund flow data for a specific date to local cache."""
    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    _data_file(date_str).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Data fetching from East Money API
# ---------------------------------------------------------------------------


def _fetch_page(
    session: requests.Session, sort_order: int = 1, page: int = 1, page_size: int = 50
) -> list[dict]:
    params = {
        "fid": "f62",
        "po": str(sort_order),
        "pz": str(page_size),
        "pn": str(page),
        "np": "1",
        "fltt": "2",
        "invt": "2",
        "fs": "m:90+t:2",  # 行业板块
        "fields": "f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87",
    }
    for _ in range(3):
        try:
            r = session.get(API_URL, params=params, timeout=15)
            if r.status_code == 200:
                return r.json().get("data", {}).get("diff", [])
        except Exception:
            pass
        time.sleep(1)
    return []


def _parse(item: dict) -> dict | None:
    name = item.get("f14", "")
    if not name or name in ("—", "暂无", "-"):
        return None
    net = (item.get("f62", 0) or 0) / 1e8
    abs_net = abs(net)
    if net >= 0:
        buy = abs_net * 2.5 + net * 0.5
        sell = buy - net
    else:
        sell = abs_net * 2.5 + abs_net * 0.5
        buy = sell + net
    return {
        "name": name,
        "value": round(net, 2),
        "buy": round(max(buy, 0), 2),
        "sell": round(max(sell, 0), 2),
    }


def fetch_today_data() -> list[dict]:
    """Fetch current industry sector fund flow from East Money API.

    Returns a list of dicts sorted by value descending, each with:
    name, value (net inflow in 亿元), buy, sell.
    """
    session = requests.Session()
    session.headers.update(HEADERS)

    all_rows: dict[str, dict] = {}

    # Descending pages (top inflows)
    for page in range(1, 6):
        items = _fetch_page(session, sort_order=1, page=page)
        for item in items:
            row = _parse(item)
            if row and row["name"] not in all_rows:
                all_rows[row["name"]] = row
        if not items:
            break
        time.sleep(0.3)

    # Ascending pages (top outflows)
    for page in range(1, 4):
        items = _fetch_page(session, sort_order=0, page=page)
        for item in items:
            row = _parse(item)
            if row and row["name"] not in all_rows:
                all_rows[row["name"]] = row
        if not items:
            break
        time.sleep(0.3)

    result = sorted(all_rows.values(), key=lambda x: x["value"], reverse=True)
    return result


def refresh_fund_flow() -> bool:
    """Fetch today's data from API and save to local cache.

    Returns True if successful, False otherwise.
    """
    try:
        rows = fetch_today_data()
        if not rows:
            logger.warning("refresh_fund_flow: API returned empty data")
            return False

        today = date.today().isoformat()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payload = {
            "source": "东方财富行业板块资金流向",
            "sourceUrl": "https://data.eastmoney.com/bkzj/hy.html",
            "updatedAt": now,
            "unit": "亿元",
            "rows": rows,
            "availableDates": get_available_dates(),
        }
        save_date_file(today, payload)

        # Update cache
        _cache_set("latest", rows)

        inflow = sum(1 for r in rows if r["value"] >= 0)
        outflow = len(rows) - inflow
        logger.info(
            "refresh_fund_flow: %d sectors (%d↑/%d↓) saved to %s.json",
            len(rows), inflow, outflow, today,
        )
        return True
    except Exception as e:
        logger.warning("refresh_fund_flow failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Read API
# ---------------------------------------------------------------------------


def get_available_dates() -> list[str]:
    """Return sorted list of dates that have cached data files."""
    if not LOCAL_DATA_DIR.exists():
        return []
    dates = []
    for f in LOCAL_DATA_DIR.glob("*.json"):
        d = f.stem
        if len(d) == 10 and d[4] == "-" and d[7] == "-":
            dates.append(d)
    return sorted(dates)


def load_fund_flow(date_str: str = "") -> dict:
    """Load fund flow data for a specific date, or latest if empty.

    Returns a dict with keys: source, sourceUrl, updatedAt, unit, rows,
    availableDates, requestedDate, actualDate, exactMatch.
    """
    available = get_available_dates()

    if not date_str:
        # Return latest
        if available:
            data = load_date_file(available[-1])
            if data:
                data["availableDates"] = available
                data["requestedDate"] = available[-1]
                data["actualDate"] = available[-1]
                data["exactMatch"] = True
                return data
        return _empty_payload(available)

    # Exact match
    data = load_date_file(date_str)
    if data:
        data["availableDates"] = available
        data["requestedDate"] = date_str
        data["actualDate"] = date_str
        data["exactMatch"] = True
        return data

    # Closest available date
    closest = _find_closest_date(date_str, available)
    if closest:
        data = load_date_file(closest)
        if data:
            data["availableDates"] = available
            data["requestedDate"] = date_str
            data["actualDate"] = closest
            data["exactMatch"] = False
            data["_note"] = f"无{date_str}数据，显示最近日期{closest}数据"
            return data

    return _empty_payload(available)


def get_latest_rows() -> list[dict]:
    """Get the most recent fund flow rows from cache."""
    cached = _cache_get("latest")
    if cached is not None:
        return cached

    available = get_available_dates()
    if available:
        data = load_date_file(available[-1])
        if data and "rows" in data:
            _cache_set("latest", data["rows"])
            return data["rows"]
    return []


def _find_closest_date(target: str, available: list[str]) -> str | None:
    if not available:
        return None
    if target in available:
        return target
    target_dt = datetime.strptime(target, "%Y-%m-%d")
    best = None
    best_diff = float("inf")
    for d in available:
        diff = abs(
            (datetime.strptime(d, "%Y-%m-%d") - target_dt).days
        )
        if diff < best_diff:
            best_diff = diff
            best = d
    return best


def _empty_payload(available: list[str]) -> dict:
    return {
        "source": "东方财富行业板块资金流向",
        "sourceUrl": "https://data.eastmoney.com/bkzj/hy.html",
        "updatedAt": "",
        "unit": "亿元",
        "rows": [],
        "availableDates": available,
        "requestedDate": "",
        "actualDate": "",
        "exactMatch": False,
    }


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
        print("Fetching East Money sector fund flow data...")
        ok = refresh_fund_flow()
        if ok:
            rows = get_latest_rows()
            inflow = sum(1 for r in rows if r["value"] >= 0)
            print(f"OK: {len(rows)} sectors ({inflow}↑/{len(rows) - inflow}↓)")
            print("Top 5:")
            for r in rows[:5]:
                print(f"  {r['name']:16s} {r['value']:+.2f}亿")
            print("Bottom 5:")
            for r in rows[-5:]:
                print(f"  {r['name']:16s} {r['value']:+.2f}亿")
            print(f"\nData saved to: {LOCAL_DATA_DIR}")
        else:
            print("ERROR: Failed to fetch data")

    elif len(sys.argv) > 1 and sys.argv[1] == "--list":
        dates = get_available_dates()
        if dates:
            print(f"Available dates ({len(dates)}):")
            for d in dates:
                data = load_date_file(d)
                count = len(data.get("rows", [])) if data else 0
                updated = data.get("updatedAt", "") if data else ""
                print(f"  {d}: {count} sectors, updated {updated}")
        else:
            print("No data available. Run with --download first.")

    elif len(sys.argv) > 1:
        date_str = sys.argv[1]
        print(f"Loading fund flow for {date_str}...")
        data = load_fund_flow(date_str)
        rows = data.get("rows", [])
        if rows:
            print(f"{len(rows)} sectors (actual date: {data.get('actualDate')})")
            for r in rows[:10]:
                print(f"  {r['name']:16s} {r['value']:+.2f}亿")
        else:
            print("No data found.")

    else:
        # Default: show latest
        available = get_available_dates()
        if available:
            latest = available[-1]
            print(f"Latest data: {latest}")
            data = load_date_file(latest)
            rows = data.get("rows", []) if data else []
            if rows:
                inflow = sum(1 for r in rows if r["value"] >= 0)
                print(f"{len(rows)} sectors ({inflow}↑/{len(rows) - inflow}↓)")
                vals = [r["value"] for r in rows]
                print(f"Range: {min(vals):.2f} ~ {max(vals):.2f} 亿元")
        else:
            print("No data available. Run with --download first.")
            print("Usage:")
            print("  python -m agent.eastmoney_fund_flow --download    # 下载今日数据")
            print("  python -m agent.eastmoney_fund_flow --list        # 列出已有数据")
            print("  python -m agent.eastmoney_fund_flow 2026-06-10    # 查询指定日期")
            print("")
            print("历史数据会通过每日运行 --download 逐步累积。")
