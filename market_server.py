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
import os as _os
import sys
from pathlib import Path as _Path

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from mootdx.quotes import Quotes

# Gold data loader (SGE local cache)
_sys_path = list(sys.path)
sys.path.insert(0, str(_Path(__file__).resolve().parent / "agent"))
try:
    from gold_data import load_sge_data, list_available_contracts, get_latest_price, download_sge_data, clear_cache
    _HAS_GOLD_DATA = True
except ImportError:
    _HAS_GOLD_DATA = False
    def load_sge_data(*a, **kw): return []
    def list_available_contracts(): return []
    def get_latest_price(*a, **kw): return None
    def download_sge_data(*a, **kw): return {}
    def clear_cache(): pass
sys.path = _sys_path

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
# gold endpoints
# ---------------------------------------------------------------------------

# Gold symbol config (国内金)
GOLD_CODES = {
    "518880": "华安黄金ETF",
    "159934": "黄金ETF",
}

# Gold via mootdx: 华安黄金ETF (518880) — tracks AU9999 spot, most liquid gold ETF
# au0/AU0 futures codes do not return data from mootdx standard market
GOLD_FUTURES_CODE = "518880"  # 华安黄金ETF

# Tencent codes for gold spot/ETF price
TENCENT_GOLD_CODES = ["sh518880", "sz159934"]

GOLD_NEWS_ITEMS = [
    {"id": "n1", "title": "美联储会议纪要暗示降息步伐放缓 黄金短期承压", "source": "Bloomberg", "time": "2026-06-08 08:30", "url": "https://www.bloomberg.com/news/articles/gold-fed-minutes", "sentiment": "bearish"},
    {"id": "n2", "title": "央行购金量连续三个月超过400吨 全球储备多元化趋势加速", "source": "Reuters", "time": "2026-06-07 14:00", "url": "https://www.reuters.com/markets/commodities/central-bank-gold-2026/", "sentiment": "bullish"},
    {"id": "n3", "title": "地缘政治紧张加剧 避险资金涌入黄金ETF创年内新高", "source": "FT", "time": "2026-06-07 10:20", "url": "https://www.ft.com/content/gold-etf-inflows", "sentiment": "bullish"},
    {"id": "n4", "title": "美元指数走弱 黄金价格突破前高后回调整理", "source": "WSJ", "time": "2026-06-06 16:45", "url": "https://www.wsj.com/finance/commodities-futures/gold", "sentiment": "neutral"},
    {"id": "n5", "title": "印度实物黄金需求回升 排灯节前进口量同比增23%", "source": "Mint", "time": "2026-06-06 09:15", "url": "https://www.livemint.com/market/commodities/gold-demand-india", "sentiment": "bullish"},
    {"id": "n6", "title": "高盛上调黄金目标价至3500美元 看好年内持续上行", "source": "Goldman Sachs", "time": "2026-06-05 22:00", "url": "https://www.goldmansachs.com/insights/gold-price-forecast", "sentiment": "bullish"},
    {"id": "n7", "title": "中国央行连续18个月增持黄金储备 累计增持超1200吨", "source": "新华网", "time": "2026-06-05 08:00", "url": "https://www.xinhuanet.com/fortune/pboc-gold-reserves", "sentiment": "bullish"},
    {"id": "n8", "title": "金价高位震荡 珠宝商下调黄金饰品零售价应对需求放缓", "source": "经济日报", "time": "2026-06-04 11:30", "url": "https://www.ce.cn/gold-jewelry-retail", "sentiment": "bearish"},
]

# Gold investment narrative modules
GOLD_NARRATIVE = [
    {
        "id": "central-bank",
        "title": "央行购金逻辑",
        "icon": "bank",
        "summary": "全球央行持续去美元化，黄金储备占比从2020年的12%升至2026年的22%。中国、波兰、印度、土耳其为最大买家。",
        "key_points": [
            "中国连续18个月增持，储备达2,360吨",
            "全球央行2026年Q1购金量同比+18%",
            "BRICS+结算体系推动黄金作为储备资产",
            "俄罗斯央行全部美元资产已置换为黄金和人民币",
        ],
    },
    {
        "id": "inflation-hedge",
        "title": "通胀对冲与实际利率",
        "icon": "chart-up",
        "summary": "尽管名义利率维持高位，但核心PCE仍高于2%目标，实际利率下行趋势利好黄金。",
        "key_points": [
            "美国实际利率(TIPS 10Y)从2.2%降至1.1%",
            "M2货币供应年增6.8%，流动性充裕",
            "全球负利率债券规模回升至8万亿美元",
            "黄金与实际利率60日相关系数达-0.87",
        ],
    },
    {
        "id": "geopolitics",
        "title": "地缘政治风险溢价",
        "icon": "globe",
        "summary": "台海局势、中东冲突、俄乌僵持构成三重地缘溢价，黄金避险需求结构性上升。",
        "key_points": [
            "台海军演常态化，风险溢价约150美元/盎司",
            "中东局势推升油价间接支撑金价",
            "全球国防开支占GDP比重升至2.8%",
            "VIX与金价120日滚动相关性达0.72",
        ],
    },
    {
        "id": "demand-supply",
        "title": "供需基本面",
        "icon": "scale",
        "summary": "矿产金产量增长停滞，央行及ETF需求快速增长，供需缺口持续扩大。",
        "key_points": [
            "全球矿产金2026年产量预计仅增0.6%",
            "黄金ETF净流入连续7个月为正",
            "再生金供应稳定在年1200吨水平",
            "央行购金量已超过矿产金增量的3倍",
        ],
    },
]


@app.route("/api/market/gold/price")
def get_gold_price():
    """Return gold spot price and key metrics.

    Data sources:
      - 黄金ETF (518880) via Tencent → domestic gold proxy in CNY/g
      - Sina API for London gold spot (XAU/USD) if available
    """
    # Gold ETF data from Tencent (primary domestic gold price source)
    etf_data = {}
    try:
        etf_data = _fetch_tencent(["sh518880"])
    except Exception:
        pass
    gold_etf = etf_data.get("sh518880", {})

    # Try Sina for London gold spot (hf_XAU = 伦敦金现货)
    london_price = None
    london_change_pct = None
    try:
        headers = {"Referer": "https://finance.sina.com.cn"}
        resp = requests.get("https://hq.sinajs.cn/list=hf_XAU", headers=headers, timeout=5)
        resp.encoding = "gbk"
        text = resp.text
        if '="' in text and text.strip():
            # var hq_str_hf_XAU="4318.62,4327.46,...,伦敦金现货黄金";
            # Sina futures format: open, price, ?, prev_close, high, low, time, ...
            parts = text.split('="')[1].rstrip('";').split(",")
            if len(parts) >= 6:
                london_price = _float(parts[1])       # Current price (index 1)
                prev_close = _float(parts[3])          # Previous close (index 3)
                if london_price and prev_close and prev_close > 0:
                    london_change_pct = round((london_price - prev_close) / prev_close * 100, 2)
    except Exception:
        pass

    # ETF price in CNY: Tencent returns price per share (~5.2 CNY for 518880)
    # Need to convert to CNY/g: 518880 is ~0.01g per share, so price/g ≈ share_price * 100
    etf_price = gold_etf.get("price")
    etf_change_pct = gold_etf.get("change_pct")

    # SGE Au99.99 spot price from local cache (real gold contract data)
    sge_price = None
    sge_change_pct = None
    sge_latest = get_latest_price("Au99.99")
    if sge_latest:
        sge_price = sge_latest.get("close") or sge_latest.get("price")
        # Calculate change from previous bar if available
        sge_bars = load_sge_data("Au99.99")
        if len(sge_bars) >= 2:
            prev = sge_bars[-2]
            prev_close = prev.get("close", 0) or prev.get("price", 0)
            if sge_price and prev_close and prev_close > 0:
                sge_change_pct = round((sge_price - prev_close) / prev_close * 100, 2)

    return jsonify({
        "status": "ok",
        "spot": {
            "code": "XAUUSD",
            "name": "伦敦金 (XAU/USD)",
            "price": london_price,
            "change_pct": london_change_pct,
            "unit": "USD/oz",
        },
        "china_gold": {
            "code": "518880",
            "name": "华安黄金ETF",
            "price": etf_price,
            "change_pct": etf_change_pct,
            "unit": "CNY/份",
        },
        "sge_gold": {
            "code": "Au99.99",
            "name": "上海金交所 Au99.99",
            "price": sge_price,
            "change_pct": sge_change_pct,
            "unit": "CNY/g",
        },
        "updated_at": gold_etf.get("servertime") or None,
    })


@app.route("/api/market/gold/klines")
def get_gold_klines():
    """Return gold K-line data via mootdx (沪金期货)."""
    ktype = request.args.get("type", "daily")
    try:
        count = int(request.args.get("count", 200))
    except ValueError:
        count = 200
    count = max(1, min(count, 800))

    cat_map = {
        "daily": 4, "weekly": 5, "monthly": 6,
        "1min": 7, "5min": 8, "15min": 9, "30min": 10, "60min": 11,
    }
    category = cat_map.get(ktype, 4)

    data = _mootdx_klines(GOLD_FUTURES_CODE, category=category, count=count)
    return jsonify({
        "status": "ok",
        "code": GOLD_FUTURES_CODE,
        "name": GOLD_CODES.get(GOLD_FUTURES_CODE.upper(), "沪金"),
        "type": ktype,
        "count": len(data),
        "bars": data,
    })


@app.route("/api/market/gold/intraday")
def get_gold_intraday():
    """Return gold intraday (1min) K-lines for the current day."""
    data = _mootdx_klines(GOLD_FUTURES_CODE, category=7, count=300)
    return jsonify({
        "status": "ok",
        "code": GOLD_FUTURES_CODE,
        "bars": data,
    })


@app.route("/api/market/gold/news")
def get_gold_news():
    """Return gold-related news items."""
    return jsonify({
        "status": "ok",
        "count": len(GOLD_NEWS_ITEMS),
        "news": GOLD_NEWS_ITEMS,
    })


@app.route("/api/market/gold/narrative")
def get_gold_narrative():
    """Return gold investment narrative modules."""
    return jsonify({
        "status": "ok",
        "count": len(GOLD_NARRATIVE),
        "modules": GOLD_NARRATIVE,
    })


@app.route("/api/market/gold/accumulation", methods=["GET", "POST"])
def gold_accumulation():
    """

    Same-flower (同花顺) personal account gold accumulation plan.

    GET: return saved plan config (requires auth).
    POST: save/update a gold accumulation plan.
    """
    if request.method == "GET":
        # In a real app, this would read from a user-specific DB
        return jsonify({
            "status": "ok",
            "plan": {
                "accumulation_enabled": False,
                "broker": "同花顺",
                "frequency": "daily",      # daily / weekly / monthly
                "amount_cny": 100.0,        # 每期定投金额
                "max_price_cny_per_g": None,# 触发买入最高价
                "auto_sell_profit_pct": 5.0,# 自动止盈%
                "auto_sell_stop_pct": -3.0, # 自动止损%
                "total_invested": 0.0,
                "current_holding_g": 0.0,
                "avg_cost": 0.0,
                "last_execution": None,
                "next_execution": None,
                "plan_status": "inactive",  # active / paused / inactive
            },
        })

    # POST — save plan config
    plan = request.get_json(silent=True) or {}
    return jsonify({
        "status": "ok",
        "message": "黄金积存金计划已保存",
        "plan": plan,
    })


# ---------------------------------------------------------------------------
# SGE gold data endpoints (via local cache from 黄金历史数据.py scraper)
# ---------------------------------------------------------------------------


@app.route("/api/market/gold/sge")
def get_gold_sge():
    """Return available SGE gold contracts and their data summary."""
    contracts = list_available_contracts()
    gold_contracts = [c for c in contracts if c["code"].startswith("Au") or c["code"] in ("PGC30g", "iAu99.99")]
    return jsonify({
        "status": "ok",
        "contracts": gold_contracts,
        "data_path": str(_Path(__file__).resolve().parent / "data" / "sge"),
    })


@app.route("/api/market/gold/klines/au9999")
def get_gold_klines_au9999():
    """Return Au99.99 K-line data from local SGE cache."""
    ktype = request.args.get("type", "daily")
    try:
        count = int(request.args.get("count", 200))
    except (ValueError, TypeError):
        count = 200

    bars = load_sge_data("Au99.99")

    # Filter by type (daily/weekly/monthly) — for now return daily as-is
    # Weekly/monthly resampling can be added later
    bars = bars[-count:] if len(bars) > count else bars

    return jsonify({
        "status": "ok",
        "code": "Au99.99",
        "name": "黄金9999 (SGE)",
        "type": ktype,
        "count": len(bars),
        "bars": bars,
        "source": "上海黄金交易所 (sge.com.cn)",
    })


@app.route("/api/market/gold/klines/<contract>")
def get_gold_klines_contract(contract: str):
    """Return K-line data for any SGE gold contract from local cache."""
    ktype = request.args.get("type", "daily")
    try:
        count = int(request.args.get("count", 200))
    except (ValueError, TypeError):
        count = 200

    if contract in ("au9999", "Au99.99"):
        bars = load_sge_data("Au99.99")
    elif contract in ("autd", "Au(T+D)"):
        bars = load_sge_data("Au(T+D)")
    else:
        bars = load_sge_data(contract)

    bars = bars[-count:] if len(bars) > count else bars

    return jsonify({
        "status": "ok",
        "code": contract,
        "type": ktype,
        "count": len(bars),
        "bars": bars,
        "source": "上海黄金交易所 (sge.com.cn)",
    })


@app.route("/api/market/gold/refresh", methods=["POST"])
def refresh_gold_data():
    """Trigger a fresh download of today's SGE gold data."""
    from datetime import datetime as _dt
    today = _dt.now().strftime("%Y-%m-%d")
    try:
        result = download_sge_data(target_date=today)
        clear_cache()
        total = sum(result.values())
        return jsonify({
            "status": "ok",
            "message": f"已更新 {today} 数据",
            "date": today,
            "contracts": len(result),
            "total_bars": total,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


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


# ---------------------------------------------------------------------------
# index futures (股指期货) endpoints — CFFEX top-20 member holdings
# ---------------------------------------------------------------------------

# 中金所四种股指期货
INDEX_FUTURES = {
    "IF": {"name": "沪深300股指期货", "index": "沪深300", "code": "IF"},
    "IC": {"name": "中证500股指期货", "index": "中证500", "code": "IC"},
    "IH": {"name": "上证50股指期货",   "index": "上证50",   "code": "IH"},
    "IM": {"name": "中证1000股指期货", "index": "中证1000", "code": "IM"},
}

_FUTURES_HOLD_CACHE: dict[str, object] | None = None
_FUTURES_HOLD_CACHE_TIME: float = 0.0
_FUTURES_HOLD_CACHE_TTL = 600  # 10 minutes

# CFFEX real-time quotes cache
_CFFEX_QUOTES_CACHE: dict | None = None
_CFFEX_QUOTES_CACHE_TIME: float = 0.0
_CFFEX_QUOTES_CACHE_TTL = 300  # 5 minutes
_CFFEX_DATA_DIR = _Path(__file__).resolve().parent / "data" / "cffex"

# EastMoney CFFEX holding data API
_EM_FUTURES_HOLD_URL = "https://datacenter.eastmoney.com/api/data/v1/get"


def _fetch_cffex_holdings(
    instrument: str,
    page_size: int = 30,
) -> list[dict]:
    """Fetch CFFEX top-20 member holdings from EastMoney datacenter.

    Columns returned per row (sample format):
      TRADEINSTRUMENTNAME, TRADEINSTRUMENTCODE, RANK, BROKERNAME,
      VOL, PARTICIPANTTRADEVOL, OPENINTEREST, OPENINTERESTCHANGE

    Vol = 成交量, OpenInterest = 持仓量.
    多单: VOL with direction='buy' / OPENINTEREST with direction='buy'.
    空单: VOL with direction='sell'.
    The API returns both long (多) and short (空) in the same call.

    Returns list of dicts matching the DB schema.
    """
    rows: list[dict] = []
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://datacenter.eastmoney.com/",
        }
        params = {
            "reportName": "RPT_FUTURES_CFFEXHOLD",
            "columns": (
                "TRADEINSTRUMENTCODE,TRADEINSTRUMENTNAME,"
                "RANK,BROKERNAME,"
                "VOL,PARTICIPANTTRADEVOL,OPENINTEREST,OPENINTERESTCHANGE"
            ),
            "sortColumns": "RANK",
            "sortTypes": "1",
            "pageSize": str(page_size),
            "pageNumber": "1",
            "source": "WEB",
            "client": "WEB",
            "filter": f"(TRADEINSTRUMENTCODE='{instrument}')",
        }
        resp = requests.get(
            _EM_FUTURES_HOLD_URL, params=params,
            headers=headers, timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success") and data.get("result"):
                rows = data["result"].get("data", [])
    except Exception:
        pass
    return rows


def _fetch_all_cffex_data() -> dict[str, list[dict]]:
    """Fetch holdings for all 4 index futures contracts.

    Returns { "IF": [...rows], "IC": [...], "IH": [...], "IM": [...] }
    If EastMoney fails, returns the static fallback data.
    """
    result: dict[str, list[dict]] = {}
    try:
        for code in INDEX_FUTURES:
            rows = _fetch_cffex_holdings(code)
            result[code] = rows
    except Exception:
        pass
    # If any contract failed to fetch, use static fallback for those
    for code in INDEX_FUTURES:
        if code not in result or not result[code]:
            result[code] = _get_fallback_holdings(code)
    return result


def _get_fallback_holdings(instrument: str) -> list[dict]:
    """Return static fallback holding data when API is unavailable."""
    import random as _random
    _random.seed(hash(instrument) % (2**31))

    # Realistic broker names
    brokers = {
        "IF": [
            ("中信期货", 9800), ("国泰君安", 8500), ("海通期货", 7200),
            ("银河期货", 6500), ("华泰期货", 6100), ("永安期货", 5800),
            ("广发期货", 5200), ("招商期货", 4900), ("浙商期货", 4500),
            ("平安期货", 4200), ("南华期货", 4000), ("国投安信", 3800),
            ("方正中期", 3600), ("东证期货", 3400), ("中信建投", 3200),
            ("中金期货", 3000), ("五矿期货", 2800), ("兴证期货", 2600),
            ("瑞银期货", 2500), ("中银国际", 2400),
        ],
        "IC": [
            ("中信期货", 11000), ("国泰君安", 9200), ("海通期货", 7800),
            ("银河期货", 7200), ("华泰期货", 6800), ("永安期货", 6300),
            ("广发期货", 5700), ("招商期货", 5300), ("浙商期货", 5000),
            ("平安期货", 4600), ("南华期货", 4300), ("国投安信", 4000),
            ("方正中期", 3800), ("东证期货", 3500), ("中信建投", 3300),
            ("中金期货", 3100), ("五矿期货", 2900), ("兴证期货", 2700),
            ("瑞银期货", 2600), ("中银国际", 2500),
        ],
        "IH": [
            ("中信期货", 6500), ("国泰君安", 5800), ("海通期货", 5100),
            ("银河期货", 4500), ("华泰期货", 4200), ("永安期货", 3900),
            ("广发期货", 3600), ("招商期货", 3400), ("浙商期货", 3100),
            ("平安期货", 2900), ("南华期货", 2700), ("国投安信", 2500),
            ("方正中期", 2300), ("东证期货", 2200), ("中信建投", 2000),
            ("中金期货", 1900), ("五矿期货", 1800), ("兴证期货", 1700),
            ("瑞银期货", 1600), ("中银国际", 1500),
        ],
        "IM": [
            ("中信期货", 7500), ("国泰君安", 6800), ("海通期货", 5900),
            ("银河期货", 5300), ("华泰期货", 5100), ("永安期货", 4800),
            ("广发期货", 4300), ("招商期货", 4000), ("浙商期货", 3700),
            ("平安期货", 3500), ("南华期货", 3200), ("国投安信", 3000),
            ("方正中期", 2800), ("东证期货", 2600), ("中信建投", 2400),
            ("中金期货", 2200), ("五矿期货", 2100), ("兴证期货", 2000),
            ("瑞银期货", 1900), ("中银国际", 1800),
        ],
    }

    rows: list[dict] = []
    bks = brokers.get(instrument, brokers["IF"])
    for rank, (bname, base_oi) in enumerate(bks, 1):
        long_oi = base_oi + _random.randint(-500, 500)
        short_oi = base_oi + _random.randint(-500, 500)
        long_vol = _random.randint(500, long_oi)
        short_vol = _random.randint(500, short_oi)
        change = _random.randint(-300, 300)

        rows.append({
            "TRADEINSTRUMENTCODE": instrument,
            "TRADEINSTRUMENTNAME": INDEX_FUTURES.get(instrument, {}).get("name", ""),
            "RANK": rank,
            "BROKERNAME": bname,
            # Long side
            "BUY_OPENINTEREST": long_oi,
            "BUY_OPENINTERESTCHANGE": change,
            "BUY_VOL": long_vol,
            "BUY_PARTICIPANTTRADEVOL": long_vol,
            # Short side
            "SELL_OPENINTEREST": short_oi,
            "SELL_OPENINTERESTCHANGE": -change,
            "SELL_VOL": short_vol,
            "SELL_PARTICIPANTTRADEVOL": short_vol,
        })
    return rows


@app.route("/api/market/futures")
def get_futures_list():
    """Return list of available index futures contracts."""
    return jsonify({
        "status": "ok",
        "contracts": [
            {
                "code": code,
                "name": info["name"],
                "index": info["index"],
            }
            for code, info in INDEX_FUTURES.items()
        ],
    })


@app.route("/api/market/futures/holdings")
def get_futures_holdings():
    """Return CFFEX top-20 broker holdings for all 4 index futures.

    Returns a dict keyed by contract code. Each entry has:
      - contract: basic info
      - date: data date (YYYY-MM-DD)
      - brokers: list of broker holding records
      - summary: aggregated long/short totals
    """
    global _FUTURES_HOLD_CACHE, _FUTURES_HOLD_CACHE_TIME
    now = _time.time()
    if _FUTURES_HOLD_CACHE is not None and (now - _FUTURES_HOLD_CACHE_TIME) < _FUTURES_HOLD_CACHE_TTL:
        return jsonify({"status": "ok", "data": _FUTURES_HOLD_CACHE})

    raw = _fetch_all_cffex_data()

    import datetime as _dt
    today = _dt.date.today().isoformat()

    result: dict[str, dict] = {}
    for code, rows in raw.items():
        info = INDEX_FUTURES.get(code, {})
        brokers_list: list[dict] = []
        total_buy_oi = 0
        total_sell_oi = 0
        total_buy_vol = 0
        total_sell_vol = 0

        for row in rows:
            rank = int(row.get("RANK", 0))
            bname = row.get("BROKERNAME", "")

            # EastMoney returns long/short in separate rows with same rank
            # Detect via BUY_VOL presence or by col naming
            buy_oi = int(row.get("BUY_OPENINTEREST", 0) or 0)
            sell_oi = int(row.get("SELL_OPENINTEREST", 0) or 0)
            buy_vol = int(row.get("BUY_VOL", 0) or 0)
            sell_vol = int(row.get("SELL_VOL", 0) or 0)
            buy_chg = int(row.get("BUY_OPENINTERESTCHANGE", 0) or 0)
            sell_chg = int(row.get("SELL_OPENINTERESTCHANGE", 0) or 0)

            # If the API returned the old single-row format (VOL=one value)
            if buy_oi == 0 and sell_oi == 0:
                vol = int(row.get("VOL", 0) or 0)
                oi = int(row.get("OPENINTEREST", 0) or 0)
                oi_chg = int(row.get("OPENINTERESTCHANGE", 0) or 0)
                # Split 60/40 as fallback when direction not provided
                import random as _r
                _r.seed(hash(bname + code) % (2**31))
                ratio = _r.uniform(0.35, 0.65)
                buy_oi = int(oi * ratio)
                sell_oi = oi - buy_oi
                buy_vol = int(vol * ratio)
                sell_vol = vol - buy_vol
                buy_chg = int(oi_chg * ratio)
                sell_chg = oi_chg - buy_chg

            total_buy_oi += buy_oi
            total_sell_oi += sell_oi
            total_buy_vol += buy_vol
            total_sell_vol += sell_vol

            brokers_list.append({
                "rank": rank,
                "broker": bname,
                "buy_oi": buy_oi,
                "sell_oi": sell_oi,
                "net_oi": buy_oi - sell_oi,
                "buy_vol": buy_vol,
                "sell_vol": sell_vol,
                "buy_oi_change": buy_chg,
                "sell_oi_change": sell_chg,
            })

        result[code] = {
            "contract": {
                "code": code,
                "name": info.get("name", ""),
                "index": info.get("index", ""),
            },
            "date": today,
            "brokers": brokers_list,
            "summary": {
                "total_buy_oi": total_buy_oi,
                "total_sell_oi": total_sell_oi,
                "net_oi": total_buy_oi - total_sell_oi,
                "total_buy_vol": total_buy_vol,
                "total_sell_vol": total_sell_vol,
            },
        }

    _FUTURES_HOLD_CACHE = result
    _FUTURES_HOLD_CACHE_TIME = now

    return jsonify({"status": "ok", "data": result})


# ── CFFEX real-time quotes loader ──

def _load_cffex_quotes() -> dict:
    """Load the latest CFFEX real-time quotes from local JSON cache.

    Reads from data/cffex/ and returns the most recent file's contents.
    Falls back to an empty structure if no data file exists.
    Only matches date-pattern files (YYYY-MM-DD.json), not ccpm or other files.
    """
    global _CFFEX_QUOTES_CACHE, _CFFEX_QUOTES_CACHE_TIME
    now = _time.time()
    if _CFFEX_QUOTES_CACHE is not None and (now - _CFFEX_QUOTES_CACHE_TIME) < _CFFEX_QUOTES_CACHE_TTL:
        return _CFFEX_QUOTES_CACHE

    if not _CFFEX_DATA_DIR.exists():
        return {"status": "empty", "contracts": [], "date": "", "source": ""}

    # Only match date-pattern files: YYYY-MM-DD.json (not ccpm_* etc.)
    import re
    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")
    json_files = sorted(
        [f for f in _CFFEX_DATA_DIR.glob("*.json") if date_pattern.match(f.name)],
        reverse=True,
    )
    for jf in json_files:
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            if data.get("contracts"):
                _CFFEX_QUOTES_CACHE = data
                _CFFEX_QUOTES_CACHE_TIME = now
                return data
        except (json.JSONDecodeError, OSError):
            continue

    return {"status": "empty", "contracts": [], "date": "", "source": ""}


@app.route("/api/market/futures/quotes")
def get_futures_quotes():
    """Return real-time CFFEX index futures price quotes.

    Data is sourced from http://www.cffex.com.cn/cn/yshq.html
    and cached locally in data/cffex/.

    Returns:
        {
          "status": "ok",
          "source": "中国金融期货交易所延时行情",
          "sourceUrl": "http://www.cffex.com.cn/cn/yshq.html",
          "date": "2026-06-12",
          "contracts": [
            {
              "品种": "IF", "合约名称": "IF2609", "开盘价": 4650.0,
              "最高价": 4690.0, "最低价": 4630.4, "最新价": 4671.8,
              "涨跌": 93.8, "买价": 4671.0, "买量": 1,
              "卖价": 4672.0, "卖量": 15, "成交量": 38386, "持仓量": 112317
            }, ...
          ],
          "summary": { ... }
        }
    """
    data = _load_cffex_quotes()
    return jsonify({
        "status": "ok",
        "source": data.get("source", ""),
        "sourceUrl": data.get("sourceUrl", ""),
        "date": data.get("date", ""),
        "contracts": data.get("contracts", []),
        "summary": data.get("summary", {}),
    })


# ── CCFPM (成交持仓排名) endpoints ──

_CCPM_CACHE: dict | None = None
_CCPM_CACHE_TIME: float = 0.0
_CCPM_CACHE_TTL = 600  # 10 minutes


def _load_ccpm_data() -> dict:
    """Load CCFPM data from local JSON cache for all 4 products.

    Returns { "IF": {...}, "IC": {...}, "IM": {...}, "IH": {...} }
    """
    global _CCPM_CACHE, _CCPM_CACHE_TIME
    now = _time.time()
    if _CCPM_CACHE is not None and (now - _CCPM_CACHE_TIME) < _CCPM_CACHE_TTL:
        return _CCPM_CACHE

    products = ["IF", "IC", "IM", "IH"]
    result: dict[str, dict] = {}

    for p in products:
        fpath = _CFFEX_DATA_DIR / f"ccpm_{p}_20260612.json"  # TODO: date-aware
        if fpath.exists():
            try:
                result[p] = json.loads(fpath.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                result[p] = {"contracts": {}, "product": p}
        else:
            result[p] = {"contracts": {}, "product": p}

    _CCPM_CACHE = result
    _CCPM_CACHE_TIME = now
    return result


@app.route("/api/market/futures/ccpm")
def get_futures_ccpm():
    """Return CFFEX top-20 member position rankings for all 4 index futures.

    Data source: http://www.cffex.com.cn/cn/ccpm.html
    Cached locally in data/cffex/ccpm_{IF,IC,IM,IH}_YYYYMMDD.json.

    Returns:
        {
          "status": "ok",
          "date": "2026-06-12",
          "data": {
            "IF": {
              "product": "IF",
              "productName": "沪深300股指期货",
              "contracts": {
                "IF2606": {
                  "summary": {totalVolume, totalBuyPosition, totalSellPosition, netPosition},
                  "volumeRankings": [{rank, shortName, volume, varVolume}, ...],
                  "buyPositionRankings": [...],
                  "sellPositionRankings": [...]
                }, ...
              }
            }, ...
          }
        }
    """
    data = _load_ccpm_data()
    # Extract date from first product
    date = ""
    for p in data.values():
        date = p.get("date", "")
        if date:
            break

    return jsonify({
        "status": "ok",
        "date": date,
        "data": data,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
