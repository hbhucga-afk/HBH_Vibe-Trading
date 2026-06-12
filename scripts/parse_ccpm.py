#!/usr/bin/env python3
"""Parse CFFEX ccpm XML for all 4 products into structured JSON."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "data" / "cffex"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PRODUCTS = {
    "IF": "沪深300股指期货",
    "IC": "中证500股指期货",
    "IM": "中证1000股指期货",
    "IH": "上证50股指期货",
}


def parse_xml(xml_path: Path, product: str, product_name: str) -> dict:
    tree = ET.parse(str(xml_path))
    root = tree.getroot()

    contracts: dict[str, dict] = {}

    for data in root.findall("data"):
        inst = data.findtext("instrumentid", "").strip()
        dtype = data.findtext("datatypeid", "").strip()
        if not inst or not dtype:
            continue

        if inst not in contracts:
            contracts[inst] = {"volumes": [], "buyPositions": [], "sellPositions": []}

        entry = {
            "rank": int(data.findtext("rank", "0")),
            "shortName": data.findtext("shortname", "").strip(),
            "volume": int(data.findtext("volume", "0")),
            "varVolume": int(data.findtext("varvolume", "0")),
            "partyId": data.findtext("partyid", "").strip(),
            "tradingDay": data.findtext("tradingday", "").strip(),
            "productId": data.findtext("productid", "").strip(),
        }

        if dtype == "0":
            contracts[inst]["volumes"].append(entry)
        elif dtype == "1":
            contracts[inst]["buyPositions"].append(entry)
        elif dtype == "2":
            contracts[inst]["sellPositions"].append(entry)

    result = {
        "source": "中国金融期货交易所成交持仓排名",
        "sourceUrl": "http://www.cffex.com.cn/cn/ccpm.html",
        "product": product,
        "productName": product_name,
        "date": "2026-06-12",
        "contracts": {},
    }

    for inst in sorted(contracts.keys()):
        c = contracts[inst]
        total_vol = sum(r["volume"] for r in c["volumes"])
        total_buy = sum(r["volume"] for r in c["buyPositions"])
        total_sell = sum(r["volume"] for r in c["sellPositions"])

        result["contracts"][inst] = {
            "instrumentId": inst,
            "tradingDay": "20260612",
            "summary": {
                "totalVolume": total_vol,
                "totalBuyPosition": total_buy,
                "totalSellPosition": total_sell,
                "netPosition": total_buy - total_sell,
            },
            "volumeRankings": c["volumes"],
            "buyPositionRankings": c["buyPositions"],
            "sellPositionRankings": c["sellPositions"],
        }

    return result


# Parse all products
all_data: dict[str, dict] = {}

for product, name in PRODUCTS.items():
    xml_path = OUT_DIR / f"ccpm_{product}_20260612.xml"
    if not xml_path.exists():
        print(f"SKIP: {product} (file not found)")
        continue

    result = parse_xml(xml_path, product, name)
    all_data[product] = result

    # Save combined per-product file
    combined_path = OUT_DIR / f"ccpm_{product}_20260612.json"
    combined_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {combined_path.name}")

    # Save per-contract files
    for inst, data in result["contracts"].items():
        out_path = OUT_DIR / f"ccpm_{inst}_20260612.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# Print summary for all products
print("\n" + "=" * 65)
print("  CFFEX 四大股指期货成交持仓排名汇总 (2026-06-12)")
print("=" * 65)

for product in ["IF", "IC", "IM", "IH"]:
    if product not in all_data:
        continue
    result = all_data[product]
    print(f"\n{'─' * 50}")
    print(f"  {product} — {PRODUCTS[product]}")
    print(f"{'─' * 50}")
    print(f"  {'合约':<10} {'成交量':>10} {'持买单':>10} {'持卖单':>10} {'净持仓':>10}")
    for inst in sorted(result["contracts"].keys()):
        s = result["contracts"][inst]["summary"]
        print(f"  {inst:<10} {s['totalVolume']:>10,} {s['totalBuyPosition']:>10,} {s['totalSellPosition']:>10,} {s['netPosition']:>+10,}")
