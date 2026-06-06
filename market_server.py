"""Lightweight market-data microservice for Vibe-Trading.

Serves real-time A-share and US index/stock quotes via Tencent Finance.
Zero API key required.
"""

from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

TENCENT_URL = "https://qt.gtimg.cn/q="

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
}


def _tencent_code(raw: str) -> str:
    """Prefix a 6-digit code with its Tencent exchange marker."""
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


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

@app.route("/api/market/indices")
def get_indices():
    """Return all 7 indices (4 A-share + 3 US) from Tencent Finance."""
    all_codes = list(A_INDICES.keys()) + list(US_INDICES.keys())
    try:
        data = _fetch_tencent(all_codes)
    except Exception:
        data = {}

    result = []
    for code, label in A_INDICES.items():
        d = data.get(code, {})
        result.append({
            "code": code,
            "name": d.get("name", label),
            "label": label,
            "price": d.get("price"),
            "change_pct": d.get("change_pct"),
            "change_amt": d.get("change_amt"),
            "market": "A股",
        })

    for code, label in US_INDICES.items():
        d = data.get(code, {})
        result.append({
            "code": code,
            "name": d.get("name", label),
            "label": label,
            "price": d.get("price"),
            "change_pct": d.get("change_pct"),
            "change_amt": d.get("change_amt"),
            "market": "美股",
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

    codes = [_tencent_code(c) for c in pool.keys()]
    try:
        data = _fetch_tencent(codes)
    except Exception:
        data = {}

    stocks = []
    for raw_code, label in pool.items():
        tc = _tencent_code(raw_code)
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
