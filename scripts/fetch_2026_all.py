"""Fetch 2026 research reports using multiple search strategies."""
import urllib.request, urllib.parse, json, time, random, hashlib, sys
from datetime import datetime

UA = "Mozilla/5.0"
EM_MIN_INTERVAL = 1.0
_em_last = [0.0]

def em_get(url, params=None, timeout=15):
    wait = EM_MIN_INTERVAL - (time.time() - _em_last[0])
    if wait > 0:
        time.sleep(wait + random.uniform(0.1, 0.3))
    try:
        qs = "&".join(f"{urllib.parse.quote(str(k))}={urllib.parse.quote(str(v))}" for k, v in (params or {}).items())
        full = f"{url}?{qs}"
        req = urllib.request.Request(full)
        req.add_header("User-Agent", UA)
        req.add_header("Referer", "https://data.eastmoney.com/")
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.read().decode("utf-8")
    finally:
        _em_last[0] = time.time()

seen = set()
all_reports = []

def add_reports(rows, source=""):
    added = 0
    for r in rows:
        title = r.get("title","")
        org = r.get("orgSName","")
        ds = (r.get("publishDate") or "")[:10]
        if not ds.startswith("2026"): continue
        h = hashlib.md5(f"{title}|{org}|{ds}".encode()).hexdigest()[:12]
        if h in seen: continue
        seen.add(h)
        # Also check which stocks are mentioned in the report
        all_reports.append({
            "title":title,"org":org,"date":ds,
            "rating":r.get("emRatingName",""),
            "source":source,
        })
        added += 1
    return added

# Strategy 1: Search by stock code (already done, but let's get more pages)
STOCKS = {
    "688017":"绿的谐波","300024":"机器人","002747":"埃斯顿",
    "300124":"汇川技术","603728":"鸣志电器","002472":"双环传动",
    "300660":"江苏雷利","688160":"步科股份","002050":"三花智控",
    "689009":"九号公司","300580":"贝斯特","002698":"博实股份",
    "603667":"五洲新春","300403":"汉宇集团","603960":"克来机电",
    "002979":"雷赛智能","300748":"金力永磁","688277":"天智航",
    "688218":"江苏北人",
}

print("=== Strategy 1: Stock code search (pages 1-5) ===")
for code, name in STOCKS.items():
    sc = 0
    for page in [1,2,3]:
        try:
            params = {
                "industryCode":"*","pageSize":"50","industry":"*",
                "rating":"*","ratingChange":"*",
                "beginTime":"2026-01-01","endTime":"2026-12-31",
                "pageNo":str(page),"fields":"","qType":"0",
                "orgCode":"","code":code,"rcode":"",
            }
            text = em_get("https://reportapi.eastmoney.com/report/list", params, timeout=15)
            d = json.loads(text)
            rows = d.get("data") or []
            if not rows: break
            added = add_reports(rows, f"stock:{code}")
            sc += added
        except Exception as e:
            break
    if sc > 0:
        print(f"  {code} {name}: {sc}")

print(f"  After stock search: {len(all_reports)} total")

# Strategy 2: Keyword search for humanoid robot topics
KEYWORDS = [
    "人形机器人",
    "机器人产业链",
    "减速器",
    "丝杠",
    "伺服电机",
    "力传感器",
    "PEEK材料",
    "碳纤维复合材料",
    "具身智能",
    "灵巧手",
    "行星滚柱丝杠",
    "谐波减速器",
    "空心杯电机",
    "无框力矩电机",
    "六维力传感器",
    "特斯拉Optimus",
    "宇树科技",
    "Figure AI",
    "波士顿动力",
]

print("\n=== Strategy 2: Keyword search ===")
for kw in KEYWORDS:
    try:
        params = {
            "industryCode":"*","pageSize":"50","industry":"*",
            "rating":"*","ratingChange":"*",
            "beginTime":"2026-01-01","endTime":"2026-12-31",
            "pageNo":"1","fields":"","qType":"1",
            "orgCode":"","keyword":kw,"rcode":"",
        }
        text = em_get("https://reportapi.eastmoney.com/report/list", params, timeout=15)
        d = json.loads(text)
        rows = d.get("data") or []
        added = add_reports(rows, f"kw:{kw}")
        if added > 0:
            print(f"  '{kw}': +{added}")
    except Exception as e:
        print(f"  '{kw}': ERR {e}")

print(f"  After keyword search: {len(all_reports)} total")

# Strategy 3: Search by industry (机器人/机械行业)
INDUSTRIES = ["机器人","机械设备","自动化","汽车零部件"]
print("\n=== Strategy 3: Industry search ===")
for ind in INDUSTRIES:
    try:
        params = {
            "industryCode":"*","pageSize":"50","industry":ind,
            "rating":"*","ratingChange":"*",
            "beginTime":"2026-01-01","endTime":"2026-12-31",
            "pageNo":"1","fields":"","qType":"0",
            "orgCode":"","rcode":"",
        }
        text = em_get("https://reportapi.eastmoney.com/report/list", params, timeout=15)
        d = json.loads(text)
        rows = d.get("data") or []
        added = add_reports(rows, f"industry:{ind}")
        print(f"  Industry '{ind}': +{added} (got {len(rows)} rows)")
    except Exception as e:
        print(f"  Industry '{ind}': ERR {e}")

print(f"\n=== GRAND TOTAL: {len(all_reports)} reports ===")

# Save
with open("/tmp/robot_2026_all.json","w",encoding="utf-8") as f:
    json.dump(all_reports, f, ensure_ascii=False, indent=2)

# Print sample
for r in all_reports[:30]:
    print(f"  [{r['source']}] {r['date']} | {r['org']} | {r['title'][:70]}")
