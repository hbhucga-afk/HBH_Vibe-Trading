#!/usr/bin/env python3
"""
人形机器人研报数据获取脚本
使用 a-stock-data 策略：东财研报 + 同花顺研报 + iwencai
按19家核心标的获取研报，按10个子模块分类
目标：收集170篇2026年研报

用法：
    python scripts/fetch_robot_reports.py                    # 全量获取
    python scripts/fetch_robot_reports.py --quick            # 快速模式（仅东财，每家10篇）
    python scripts/fetch_robot_reports.py --output data.json # 自定义输出路径
"""

import json
import os
import sys
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

# ---------- 19 家核心标的 ----------
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
    "688218": "江苏北人",
}

# ---------- 10 个子模块 & 分类关键词 ----------
MODULE_KEYWORDS = {
    "overview": {
        "title": "总览",
        "icon": "LayoutDashboard",
        "keywords": ["行业", "产业链", "市场规模", "政策", "人形机器人", "前景", "趋势", "格局", "全景", "年度策略"],
    },
    "cost": {
        "title": "成本构成",
        "icon": "PieChart",
        "keywords": ["BOM", "成本拆分", "价值量", "ASP", "降本", "成本结构", "单台", "价格"],
    },
    "reducer": {
        "title": "减速器",
        "icon": "Gauge",
        "keywords": ["谐波减速器", "RV减速器", "行星减速器", "绿的谐波", "双环传动", "减速机", "精密减速"],
    },
    "leadscrew": {
        "title": "丝杠",
        "icon": "Wrench",
        "keywords": ["行星滚柱丝杠", "滚珠丝杠", "梯形丝杠", "五洲新春", "贝斯特", "丝杠", "线性执行"],
    },
    "motor": {
        "title": "电机",
        "icon": "Zap",
        "keywords": ["无框力矩电机", "空心杯电机", "伺服电机", "步科股份", "鸣志电器", "汇川技术", "电机", "执行器"],
    },
    "sensor": {
        "title": "传感器",
        "icon": "Cpu",
        "keywords": ["六维力传感器", "力矩传感器", "IMU", "视觉", "柯力传感", "汉宇集团", "触觉", "力觉", "编码器"],
    },
    "tendon_material": {
        "title": "腱绳/新材料",
        "icon": "FlaskConical",
        "keywords": ["腱绳", "PEEK", "碳纤维", "超高分子量聚乙烯", "UHMWPE", "轻量化", "新材料", "形状记忆", "SMA"],
    },
    "substitution_risk": {
        "title": "替代风险",
        "icon": "AlertTriangle",
        "keywords": ["国产替代", "海外竞争", "技术路线", "专利壁垒", "特斯拉", "波士顿动力", "替代", "突破", "壁垒"],
    },
    "valuation": {
        "title": "估值全景",
        "icon": "BarChart3",
        "keywords": ["PE", "估值", "市值", "盈利预测", "DCF", "目标价", "财务模型", "业绩", "利润"],
    },
    "yushu": {
        "title": "宇树科技",
        "icon": "Bot",
        "keywords": ["宇树", "Unitree", "H1", "G1", "人形机器人本体", "四足机器人", "整机", "Figure", "Optimus整机"],
    },
}


def classify_report(title: str, org: str) -> str:
    """基于标题和研究机构关键词，将研报分类到子模块"""
    title_lower = title.lower()
    scores = {}
    for mod_id, mod_info in MODULE_KEYWORDS.items():
        score = 0
        for kw in mod_info["keywords"]:
            if kw.lower() in title_lower:
                score += 1
        scores[mod_id] = score

    # 返回得分最高的模块
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "overview"  # 默认归入总览
    return best


def report_hash(title: str, org: str, date: str) -> str:
    """生成研报唯一标识"""
    return hashlib.md5(f"{title}|{org}|{date}".encode()).hexdigest()[:12]


def fetch_eastmoney_reports(code: str, name: str, max_count: int = 10) -> list[dict]:
    """
    从东方财富获取个股研报
    使用东财研报接口：https://reportapi.eastmoney.com/

    注意：东财接口有反爬限制，生产环境需配合代理和限流
    """
    import urllib.request
    import urllib.parse

    reports = []
    try:
        # 东财研报列表API（需要referer和user-agent）
        url = (
            f"https://reportapi.eastmoney.com/report/list?"
            f"stockCode={code}&industryName=*&pageSize={max_count}&pageNo=1"
            f"&beginTime=2026-01-01&endTime=2026-12-31"
            f"&sortColumns=PUBLISHDATE&sortTypes=-1"
        )
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        req.add_header("Referer", "https://data.eastmoney.com/")

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("success") and data.get("result", {}).get("data"):
            for item in data["result"]["data"]:
                title = item.get("title", "")
                org = item.get("orgSName", "")
                date = item.get("publishDate", "")[:10]
                reports.append({
                    "title": title,
                    "org": org,
                    "date": date,
                    "rating": item.get("rateName", "") or item.get("indvRating", ""),
                    "module": classify_report(title, org),
                    "hash": report_hash(title, org, date),
                })
    except Exception as e:
        print(f"  [WARN] 东财研报获取失败 {code} {name}: {e}", file=sys.stderr)

    return reports


def fetch_ths_reports(code: str, name: str, max_count: int = 10) -> list[dict]:
    """
    从同花顺iFinD获取个股研报
    使用同花顺研报接口（需要iFinD权限）

    注意：同花顺研报接口需要登录态，无权限时返回空列表
    """
    reports = []
    try:
        import urllib.request

        url = (
            f"https://basic.10jqka.com.cn/api/stockph/reportlist/"
            f"?code={code}&page=1&size={max_count}&type=1"
        )
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        req.add_header("Referer", "https://www.10jqka.com.cn/")

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("status") == 0 and data.get("data", {}).get("list"):
            for item in data["data"]["list"]:
                title = item.get("title", "")
                org = item.get("org_name", "")
                date = item.get("date", "")[:10]
                reports.append({
                    "title": title,
                    "org": org,
                    "date": date,
                    "rating": item.get("rating", ""),
                    "module": classify_report(title, org),
                    "hash": report_hash(title, org, date),
                })
    except Exception as e:
        print(f"  [WARN] 同花顺研报获取失败 {code} {name}: {e}", file=sys.stderr)

    return reports


def fetch_iwencai_reports(name: str, max_count: int = 10) -> list[dict]:
    """
    从i问财获取研报信息
    使用iwencai搜索接口
    """
    reports = []
    try:
        import urllib.request
        import urllib.parse

        query = urllib.parse.quote(f"{name} 研报 2026")
        url = f"https://www.iwencai.com/unifiedwap/result?w={query}&querytype=stock"
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")
            # iwencai返回HTML，需要解析（此处简化处理）
            # 实际使用时应使用BeautifulSoup解析
            pass
    except Exception as e:
        print(f"  [WARN] iwencai研报获取失败 {name}: {e}", file=sys.stderr)

    return reports


def build_module_summary(module_id: str, reports: list[dict]) -> str:
    """基于研报内容生成模块摘要"""
    module_info = MODULE_KEYWORDS[module_id]
    stock_names = [ROBOT_STOCKS.get(r.get("code", ""), "") for r in reports if r.get("code")]
    orgs = list(set(r.get("org", "") for r in reports if r.get("org")))

    # 简单模板摘要，实际使用时可由LLM生成
    return f"{module_info['title']}模块共收录{len(reports)}篇研报，"
    f"涉及标的{len(set(stock_names))}个，"
    f"主要研究机构包括{'、'.join(orgs[:5])}等。"


def main():
    import argparse

    parser = argparse.ArgumentParser(description="人形机器人研报数据获取")
    parser.add_argument("--quick", action="store_true", help="快速模式（仅东财，每家5篇）")
    parser.add_argument("--output", default=None, help="自定义输出路径")
    parser.add_argument("--max-per-stock", type=int, default=10, help="每只股票最大研报数")
    args = parser.parse_args()

    # 默认输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = Path(__file__).parent.parent / "frontend" / "public" / "data" / "robot_research.json"

    max_per = 5 if args.quick else args.max_per_stock

    print(f"=== 人形机器人研报数据获取 ===")
    print(f"目标: {len(ROBOT_STOCKS)} 家核心标的 × {max_per} 篇 = {len(ROBOT_STOCKS) * max_per} 篇")
    print(f"输出: {output_path}")
    print()

    all_reports = []
    seen_hashes = set()

    for i, (code, name) in enumerate(ROBOT_STOCKS.items(), 1):
        print(f"[{i}/{len(ROBOT_STOCKS)}] 获取 {code} {name} 的研报...")

        # 东财研报
        time.sleep(0.5)  # 限流
        em_reports = fetch_eastmoney_reports(code, name, max_per)
        print(f"  东财: {len(em_reports)} 篇")

        # 同花顺研报
        if not args.quick:
            time.sleep(0.5)
            ths_reports = fetch_ths_reports(code, name, max_per)
            print(f"  同花顺: {len(ths_reports)} 篇")
        else:
            ths_reports = []

        # iwencai补充
        if not args.quick:
            time.sleep(0.5)
            iwc_reports = fetch_iwencai_reports(name, 3)
        else:
            iwc_reports = []

        # 合并去重
        new_reports = em_reports + ths_reports + iwc_reports
        for r in new_reports:
            if r["hash"] not in seen_hashes:
                r["code"] = code
                r["name"] = name
                seen_hashes.add(r["hash"])
                all_reports.append(r)

    print(f"\n=== 总计去重后: {len(all_reports)} 篇研报 ===")

    # 按模块分类汇总
    modules = {}
    for mod_id, mod_info in MODULE_KEYWORDS.items():
        mod_reports = [r for r in all_reports if r.get("module") == mod_id]
        modules[mod_id] = {
            "id": mod_id,
            "title": mod_info["title"],
            "icon": mod_info["icon"],
            "report_count": len(mod_reports),
            "summary": build_module_summary(mod_id, mod_reports),
            "reports": sorted(mod_reports, key=lambda x: x.get("date", ""), reverse=True)[:10],
            "key_points": [],
        }

    # 构建标的汇总
    stocks_summary = []
    for code, name in ROBOT_STOCKS.items():
        stock_reports = [r for r in all_reports if r.get("code") == code]
        modules_for_stock = list(set(r.get("module", "") for r in stock_reports))
        stocks_summary.append({
            "code": code,
            "name": name,
            "module": modules_for_stock[0] if modules_for_stock else "overview",
            "report_count": len(stock_reports),
            "consensus_rating": "",
            "avg_pe": None,
            "key_points": [],
        })

    # 构建最终输出
    output = {
        "meta": {
            "total_reports": len(all_reports),
            "stocks_count": len(ROBOT_STOCKS),
            "fetch_date": datetime.now().strftime("%Y-%m-%d"),
            "updated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "东方财富研报 + 同花顺研报 + iwencai",
            "description": "人形机器人产业链深度研报合集，覆盖19家核心标的，按10个维度分类",
        },
        "modules": modules,
        "stocks": stocks_summary,
    }

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n=== 数据已保存至: {output_path} ===")
    print(f"总研报数: {len(all_reports)}")
    for mod_id, mod_data in modules.items():
        print(f"  {mod_data['title']}: {mod_data['report_count']} 篇")


if __name__ == "__main__":
    main()
