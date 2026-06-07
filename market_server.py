"""Lightweight market-data microservice for Vibe-Trading.

Data sources (a-stock-data strategy):
  Layer 1 — mootdx (TCP 7709)    → K-line, level-2 quotes, finance snapshots (no IP block)
  Layer 2 — Tencent (qt.gtimg.cn) → PE/PB/mcap/turnover, A-share & US indices (no IP block)
  Layer 3 — Sina (hq.sinajs.cn)   → Japan/Korea/HK global indices (stable, no rate limit)

Strategy adapted from a-stock-data (github.com/simonlin1212/a-stock-data):
  prefer sources that don't block IP — mootdx/Tencent/Sina first, EastMoney only
  for unique data (dragon-tiger, margin, etc.) with built-in throttling.
Zero API key required.
"""

import json
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from mootdx.quotes import Quotes

# mootdx TCP client factory — fresh client per request avoids stale connections
def _get_mootdx():
    return Quotes.factory(market='std')

app = Flask(__name__)
CORS(app)

TENCENT_URL = "https://qt.gtimg.cn/q="
SINA_URL = "https://hq.sinajs.cn/list="

# ---- index definitions (all via Tencent) ----
A_INDICES = {
    "sh000001": "上证指数",
    "sz399001": "深证成指",
    "sz399006": "创业板指",
    "sh000300": "沪深300",
}

US_INDICES = {
    "us.DJI": "道琼斯",
    "us.IXIC": "纳斯达克",
    "us.INX": "标普500",
}

# ---- sector stock pools ----
ROBOT_STOCKS = {
    "688017": "绿的谐波",
    "300024": "机器人",
    "002747": "埃斯顿",
    "300124": "汇川技术",
    "603728": "鸣志电器",
    "002472": "双环传动",
    "300660": "江苏雷利",
    "688160": "步科股份",
    "002050": "三花智控",
    "689009": "九号公司",
    "300580": "贝斯特",
    "002698": "博实股份",
    "603667": "五洲新春",
    "300403": "汉宇集团",
    "603960": "克来机电",
    "002979": "雷赛智能",
    "300748": "金力永磁",
    "688277": "天智航",
    "002527": "新时达",
    "688218": "江苏北人",
}

AI_COMPUTE_STOCKS = {
    "688256": "寒武纪",
    "688041": "海光信息",
    "002230": "科大讯飞",
    "300474": "景嘉微",
    "603019": "中科曙光",
    "000977": "浪潮信息",
    "688111": "金山办公",
    "300502": "新易盛",
    "002415": "海康威视",
    "603501": "韦尔股份",
    "688981": "中芯国际",
    "300308": "中际旭创",
    "688012": "中微公司",
    "300394": "天孚通信",
    "688072": "拓荆科技",
    "002049": "紫光国微",
    "688008": "澜起科技",
    "300782": "卓胜微",
    "002371": "北方华创",
    "688396": "华润微",
}


def get_prefix(raw: str) -> str:
    """6-digit code → exchange prefix (a-stock-data convention)."""
    if raw.startswith("6") or raw.startswith("9"):
        return f"sh{raw}"
    if raw.startswith("8"):
        return f"bj{raw}"
    return f"sz{raw}"


def _fetch_tencent(codes: list[str]) -> dict[str, dict]:
    """Fetch real-time quotes from Tencent Finance and return parsed dict."""
    if not codes:
        return {}
    url = TENCENT_URL + ",".join(codes)
    resp = requests.get(url, timeout=10)
    resp.encoding = "gbk"
    text = resp.text

    results = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or "=" not in line:
            continue
        # v_sh000001="1~name~price~..."
        key, _, val = line.partition("=")
        # strip wrapping quotes
        val = val.strip().strip('";')
        if not val:
            continue
        # extract raw code from key like "v_sh000001"
        raw_code = key.replace("v_", "").strip('"')
        fields = val.split("~")
        if len(fields) < 40:
            continue
        try:
            results[raw_code] = {
                "name": fields[1],
                "price": _float(fields[3]),
                "last_close": _float(fields[4]),
                "open": _float(fields[5]),
                "high": _float(fields[33]),
                "low": _float(fields[34]),
                "change_pct": _float(fields[32]),
                "change_amt": _float(fields[31]),
                "amount_wan": _float(fields[37]),
                "pe_ttm": _float(fields[39]),
                "pb": _float(fields[46]),
                "mcap_yi": _float(fields[44]),  # 总市值(亿)
                "float_mcap_yi": _float(fields[45]),  # 流通市值(亿)
            }
        except (ValueError, IndexError):
            continue
    return results


def _float(s: str) -> float | None:
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _fetch_sina_global(codes: list[str]) -> dict[str, dict]:
    """Fetch global indices from Sina Finance.

    Sina is stable with no rate limiting (a-stock-data strategy).
    Supports: znb_NKY (Nikkei), znb_KOSPI (KOSPI), int_hangseng (Hang Seng).
    Format per line: var hq_str_CODE="name,price,change_amt,change_pct,...";
    """
    headers = {"Referer": "https://finance.sina.com.cn"}
    results = {}
    try:
        resp = requests.get(SINA_URL + ",".join(codes), headers=headers, timeout=10)
        resp.encoding = "gbk"
        for line in resp.text.strip().splitlines():
            if '="' not in line:
                continue
            # var hq_str_znb_NKY="日経225,66587.90,-882.79,-1.31,...";
            code_part, _, payload = line.partition('="')
            # Extract code from "var hq_str_znb_NKY"
            code = code_part.replace("var hq_str_", "").strip()
            payload = payload.rstrip('";')
            if not payload:
                continue
            parts = payload.split(",")
            if len(parts) < 4:
                continue
            results[code] = {
                "name": parts[0],
                "price": _float(parts[1]),
                "change_amt": _float(parts[2]),
                "change_pct": _float(parts[3]),
            }
    except Exception:
        pass
    return results


def _mootdx_quotes(codes: list[str]) -> dict[str, dict]:
    """Fetch real-time level-2 quotes via mootdx (通达信 TCP).

    Returns per-code dict with: price, servertime, bid1~bid5, ask1~ask5,
    bid_vol1~bid_vol5, ask_vol1~ask_vol5.
    Does NOT include PE / PB / mcap — use _fetch_tencent for those.
    """
    if not codes:
        return {}
    try:
        df = _get_mootdx().quotes(symbol=codes)
        if df is None or df.empty:
            return {}
        results = {}
        for row in df.to_dict(orient="records"):
            code = str(row.get("code", ""))
            results[code] = {
                "price": _float(str(row.get("price", ""))),
                "servertime": str(row.get("servertime", "")),
                "bid1": _float(str(row.get("bid1", ""))),
                "bid2": _float(str(row.get("bid2", ""))),
                "bid3": _float(str(row.get("bid3", ""))),
                "bid4": _float(str(row.get("bid4", ""))),
                "bid5": _float(str(row.get("bid5", ""))),
                "ask1": _float(str(row.get("ask1", ""))),
                "ask2": _float(str(row.get("ask2", ""))),
                "ask3": _float(str(row.get("ask3", ""))),
                "ask4": _float(str(row.get("ask4", ""))),
                "ask5": _float(str(row.get("ask5", ""))),
                "bid_vol1": _float(str(row.get("bid_vol1", ""))),
                "bid_vol2": _float(str(row.get("bid_vol2", ""))),
                "bid_vol3": _float(str(row.get("bid_vol3", ""))),
                "bid_vol4": _float(str(row.get("bid_vol4", ""))),
                "bid_vol5": _float(str(row.get("bid_vol5", ""))),
                "ask_vol1": _float(str(row.get("ask_vol1", ""))),
                "ask_vol2": _float(str(row.get("ask_vol2", ""))),
                "ask_vol3": _float(str(row.get("ask_vol3", ""))),
                "ask_vol4": _float(str(row.get("ask_vol4", ""))),
                "ask_vol5": _float(str(row.get("ask_vol5", ""))),
            }
        return results
    except Exception:
        return {}


def _mootdx_klines(code: str, category: int = 4, count: int = 60) -> list[dict]:
    """Fetch K-line data via mootdx.

    category: 4=daily, 5=weekly, 6=monthly, 7=1min, 8=5min, 9=15min,
              10=30min, 11=60min
    Returns list of {open, close, high, low, vol, amount, datetime}.
    """
    try:
        data = _get_mootdx().bars(symbol=code, category=category, offset=count)
        if data is None or data.empty:
            return []
        bars = []
        for row in data.to_dict(orient="records"):
            bars.append({
                "time": str(row.get("datetime", "")),
                "open": _float(str(row.get("open", ""))),
                "close": _float(str(row.get("close", ""))),
                "high": _float(str(row.get("high", ""))),
                "low": _float(str(row.get("low", ""))),
                "volume": _float(str(row.get("vol", ""))),
            })
        return bars
    except Exception:
        return []


def _mootdx_finance(code: str) -> dict[str, object] | None:
    """Fetch quarterly finance snapshot via mootdx.

    Returns 37 fields: liutongguben, zongguben, eps, bvps, roe,
    profit, income, meigujingzichan, meigugongjijin, etc.
    """
    try:
        fin = _get_mootdx().finance(symbol=code)
        if fin is None:
            return None
        # DataFrame → dict (first row)
        if hasattr(fin, "to_dict"):
            rows = fin.to_dict(orient="records")
            return rows[0] if rows else None
        return fin if isinstance(fin, dict) else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

@app.route("/api/market/indices")
def get_indices():
    """Return A-share + US + Japan + Korea + Hong Kong indices."""
    all_codes = list(A_INDICES.keys()) + list(US_INDICES.keys())
    try:
        data = _fetch_tencent(all_codes)
    except Exception:
        data = {}

    # Sina global indices (stable, no rate limit) — batched call
    sina_data = _fetch_sina_global(["znb_NKY", "znb_KOSPI", "int_hangseng"])
    nikkei = sina_data.get("znb_NKY", {})
    kospi = sina_data.get("znb_KOSPI", {})
    hsi = sina_data.get("int_hangseng", {})

    result: list[dict] = []
    for code, label in A_INDICES.items():
        d = data.get(code, {})
        result.append({
            "code": code, "name": d.get("name", label), "label": label,
            "price": d.get("price"), "change_pct": d.get("change_pct"),
            "change_amt": d.get("change_amt"), "market": "A股",
        })

    for code, label in US_INDICES.items():
        d = data.get(code, {})
        result.append({
            "code": code, "name": d.get("name", label), "label": label,
            "price": d.get("price"), "change_pct": d.get("change_pct"),
            "change_amt": d.get("change_amt"), "market": "美股",
        })

    result.append({
        "code": "int_nikkei", "name": nikkei.get("name", "日经225"),
        "label": "日经225", "price": nikkei.get("price"),
        "change_pct": nikkei.get("change_pct"),
        "change_amt": nikkei.get("change_amt"), "market": "日本",
    })

    result.append({
        "code": "100.KS11", "name": kospi.get("name", "韩国KOSPI"),
        "label": "韩国KOSPI", "price": kospi.get("price"),
        "change_pct": kospi.get("change_pct"),
        "change_amt": kospi.get("change_amt"), "market": "韩国",
    })

    result.append({
        "code": "int_hangseng", "name": hsi.get("name", "恒生指数"),
        "label": "恒生指数", "price": hsi.get("price"),
        "change_pct": hsi.get("change_pct"),
        "change_amt": hsi.get("change_amt"), "market": "港股",
    })

    return jsonify({"status": "ok", "indices": result})


@app.route("/api/market/stocks/<group>")
def get_stocks(group: str):
    """Return sector stock list. group = 'robot' | 'ai-compute'."""
    if group == "robot":
        pool = ROBOT_STOCKS
        group_name = "人形机器人"
    elif group == "ai-compute":
        pool = AI_COMPUTE_STOCKS
        group_name = "AI算力"
    else:
        return jsonify({"status": "error", "message": f"unknown group: {group}"}), 404

    codes = [get_prefix(c) for c in pool.keys()]
    try:
        data = _fetch_tencent(codes)
    except Exception:
        data = {}

    stocks = []
    for raw_code, label in pool.items():
        tc = get_prefix(raw_code)
        d = data.get(tc, {})
        stocks.append({
            "code": raw_code,
            "name": d.get("name", label),
            "label": label,
            "price": d.get("price"),
            "change_pct": d.get("change_pct"),
            "pe_ttm": d.get("pe_ttm"),
            "mcap_yi": d.get("mcap_yi"),
        })

    return jsonify({"status": "ok", "group": group_name, "stocks": stocks})


@app.route("/api/market/klines/<code>")
def get_klines(code: str):
    """Return K-line data for a single stock.

    Query params:
      type  — daily (default), weekly, monthly, 1min, 5min, 15min, 30min, 60min
      count — number of bars (default 60, max 800)
    """
    cat_map = {
        "daily": 4, "weekly": 5, "monthly": 6,
        "1min": 7, "5min": 8, "15min": 9, "30min": 10, "60min": 11,
    }
    ktype = request.args.get("type", "daily")
    category = cat_map.get(ktype, 4)
    try:
        count = int(request.args.get("count", 60))
    except ValueError:
        count = 60
    count = max(1, min(count, 800))

    data = _mootdx_klines(code, category=category, count=count)
    return jsonify({"status": "ok", "code": code, "type": ktype,
                    "count": len(data), "bars": data})


@app.route("/api/market/quotes/<code>")
def get_quotes(code: str):
    """Return level-2 quotes (bid/ask 5 levels) for a single stock via mootdx."""
    data = _mootdx_quotes([code])
    if not data:
        return jsonify({"status": "error", "message": "quotes unavailable"}), 502
    return jsonify({"status": "ok", "code": code, "quotes": data.get(code, {})})


@app.route("/api/market/finance/<code>")
def get_finance(code: str):
    """Return quarterly finance snapshot for a single stock (mootdx)."""
    data = _mootdx_finance(code)
    if data is None:
        return jsonify({"status": "error", "message": "finance data unavailable"}), 502
    return jsonify({"status": "ok", "code": code, "finance": data})


# ---------------------------------------------------------------------------
# robot research endpoints
# ---------------------------------------------------------------------------
import os as _os
import subprocess as _subprocess
import threading as _threading
import time as _time

_ROBOT_RESEARCH_JSON = _os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "frontend", "public", "data", "robot_research.json",
)
_research_cache: dict | None = None
_research_cache_time: float = 0.0
_CACHE_TTL = 300  # 5 minutes


def _load_research_data() -> dict:
    """Load research data with simple file-based cache."""
    global _research_cache, _research_cache_time
    now = _time.time()
    if _research_cache is not None and (now - _research_cache_time) < _CACHE_TTL:
        return _research_cache
    try:
        with open(_ROBOT_RESEARCH_JSON, "r", encoding="utf-8") as f:
            _research_cache = json.loads(f.read())
            _research_cache_time = now
            return _research_cache
    except Exception:
        return {
            "meta": {"total_reports": 0, "stocks_count": 0, "fetch_date": "", "updated_at": ""},
            "modules": {},
            "stocks": [],
        }


@app.route("/api/market/robot-research")
def get_robot_research():
    """Return humanoid robot research report data (10 modules, 19 stocks)."""
    data = _load_research_data()
    return jsonify({"status": "ok", **data})


_refresh_lock = _threading.Lock()
_refresh_running = False


def _run_refresh():
    """Background task: run fetch_robot_reports.py."""
    global _refresh_running
    try:
        script = _os.path.join(
            _os.path.dirname(_os.path.abspath(__file__)),
            "scripts", "fetch_robot_reports.py",
        )
        _subprocess.run(
            [sys.executable, script, "--quick"],
            capture_output=True, timeout=120,
        )
    except Exception:
        pass
    finally:
        _refresh_running = False
        # Invalidate cache
        global _research_cache_time
        _research_cache_time = 0.0


@app.route("/api/market/robot-research/refresh", methods=["POST"])
def refresh_robot_research():
    """Trigger research report data refresh (async)."""
    global _refresh_running
    if _refresh_running:
        return jsonify({"status": "busy", "message": "刷新正在进行中，请稍后再试"}), 409

    with _refresh_lock:
        if _refresh_running:
            return jsonify({"status": "busy", "message": "刷新正在进行中"}), 409
        _refresh_running = True
        _threading.Thread(target=_run_refresh, daemon=True).start()

    return jsonify({"status": "accepted", "message": "研报数据刷新已启动"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
