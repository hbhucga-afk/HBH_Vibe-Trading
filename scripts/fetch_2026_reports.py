"""Fetch 2026-only research reports from EastMoney for 19 humanoid robot stocks."""
import urllib.request, urllib.parse, json, time, random, hashlib, sys
from datetime import datetime
from collections import Counter

UA = "Mozilla/5.0"
EM_MIN_INTERVAL = 0.9
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

STOCKS = {
    "688017":"绿的谐波","300024":"机器人","002747":"埃斯顿",
    "300124":"汇川技术","603728":"鸣志电器","002472":"双环传动",
    "300660":"江苏雷利","688160":"步科股份","002050":"三花智控",
    "689009":"九号公司","300580":"贝斯特","002698":"博实股份",
    "603667":"五洲新春","300403":"汉宇集团","603960":"克来机电",
    "002979":"雷赛智能","300748":"金力永磁","688277":"天智航",
    "688218":"江苏北人",
}

def classify(title):
    kw = {
        "overview": ["人形机器人","产业链","行业","市场规模","政策","趋势","格局","全景","年度策略","产业化"],
        "cost": ["BOM","成本拆解","价值量","降本","目标价","成本"],
        "reducer": ["谐波减速器","RV减速器","行星减速器","绿的谐波","双环传动","减速器"],
        "leadscrew": ["行星滚柱丝杠","滚珠丝杠","梯形丝杠","五洲新春","贝斯特","丝杠"],
        "motor": ["无框力矩","空心杯","伺服电机","步科股份","鸣志电器","汇川技术","电机","关节电机"],
        "sensor": ["六维力","力矩传感器","IMU","视觉传感器","触觉","力觉","编码器"],
        "tendon_material": ["腱绳","PEEK","碳纤维","UHMWPE","轻量化","新材料"],
        "substitution_risk": ["国产替代","竞争格局","技术路线","专利壁垒","特斯拉","波士顿动力","护城河"],
        "valuation": ["PE","估值分析","盈利预测","DCF","目标价","财务模型"],
        "yushu": ["宇树","Unitree","H1","G1","整机","Figure","Optimus","四足"],
    }
    tl = title.lower()
    scores = {k: sum(1 for w in v if w.lower() in tl) for k, v in kw.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "overview"

all_reports = []
seen = set()

for i, (code, name) in enumerate(STOCKS.items(), 1):
    sc = 0
    for page in [1, 2]:
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
            for r in rows:
                title = r.get("title","")
                org = r.get("orgSName","")
                ds = (r.get("publishDate") or "")[:10]
                if not ds.startswith("2026"): continue
                h = hashlib.md5(f"{title}|{org}|{ds}".encode()).hexdigest()[:12]
                if h in seen: continue
                seen.add(h)
                all_reports.append({
                    "title":title,"org":org,"date":ds,
                    "rating":r.get("emRatingName",""),
                    "module":classify(title),"code":code,"name":name,
                })
                sc += 1
        except Exception as e:
            break
    print(f"[{i}/19] {code} {name}: {sc} (total {len(all_reports)})")

# Real-time market data (from Tencent, fetched earlier)
market = {
    "688017":{"price":393.0,"pe_ttm":526.85,"pb":20.19,"mcap_yi":720.49},
    "300024":{"price":15.57,"pe_ttm":-55.39,"pb":6.02,"mcap_yi":243.7},
    "002747":{"price":31.02,"pe_ttm":230.61,"pb":9.27,"mcap_yi":242.7},
    "300124":{"price":75.08,"pe_ttm":42.88,"pb":5.8,"mcap_yi":1809.66},
    "603728":{"price":65.82,"pe_ttm":406.91,"pb":9.27,"mcap_yi":275.71},
    "002472":{"price":42.86,"pe_ttm":28.69,"pb":3.53,"mcap_yi":320.82},
    "300660":{"price":33.84,"pe_ttm":72.57,"pb":5.63,"mcap_yi":196.59},
    "688160":{"price":122.0,"pe_ttm":148.4,"pb":8.62,"mcap_yi":110.82},
    "002050":{"price":47.51,"pe_ttm":48.92,"pb":6.13,"mcap_yi":1750.36},
    "689009":{"price":36.36,"pe_ttm":17.66,"pb":3.56,"mcap_yi":203.46},
    "300580":{"price":23.45,"pe_ttm":41.82,"pb":3.51,"mcap_yi":110.82},
    "002698":{"price":12.47,"pe_ttm":25.91,"pb":3.02,"mcap_yi":104.78},
    "603667":{"price":74.34,"pe_ttm":337.71,"pb":7.14,"mcap_yi":272.24},
    "300403":{"price":11.11,"pe_ttm":31.33,"pb":3.06,"mcap_yi":47.45},
    "603960":{"price":21.66,"pe_ttm":267.98,"pb":5.06,"mcap_yi":56.79},
    "002979":{"price":55.69,"pe_ttm":72.58,"pb":9.4,"mcap_yi":123.5},
    "300748":{"price":31.12,"pe_ttm":58.02,"pb":5.81,"mcap_yi":351.67},
    "688277":{"price":16.66,"pe_ttm":-35.17,"pb":6.57,"mcap_yi":75.97},
    "688218":{"price":43.72,"pe_ttm":-87.74,"pb":5.97,"mcap_yi":50.92},
}

SM = {
    "688017":"减速器","300024":"总览","002747":"总览","300124":"电机",
    "603728":"电机","002472":"减速器","300660":"电机","688160":"电机",
    "002050":"总览","689009":"总览","300580":"丝杠","002698":"总览",
    "603667":"丝杠","300403":"传感器","603960":"总览","002979":"电机",
    "300748":"电机","688277":"总览","688218":"总览",
}

MN = {
    "overview":{"title":"总览","icon":"LayoutDashboard"},
    "cost":{"title":"成本构成","icon":"PieChart"},
    "reducer":{"title":"减速器","icon":"Gauge"},
    "leadscrew":{"title":"丝杠","icon":"Wrench"},
    "motor":{"title":"电机","icon":"Zap"},
    "sensor":{"title":"传感器","icon":"Cpu"},
    "tendon_material":{"title":"腱绳/新材料","icon":"FlaskConical"},
    "substitution_risk":{"title":"替代风险","icon":"AlertTriangle"},
    "valuation":{"title":"估值全景","icon":"BarChart3"},
    "yushu":{"title":"宇树科技","icon":"Bot"},
}

# Build modules
modules = {}
for mid, mi in MN.items():
    mr = [r for r in all_reports if r.get("module")==mid]
    mr.sort(key=lambda x: x.get("date",""), reverse=True)
    orgs = list(set(r["org"] for r in mr))
    modules[mid] = {
        "id":mid,"title":mi["title"],"icon":mi["icon"],
        "report_count":len(mr),"reports":mr[:15],"orgs":orgs[:10],
    }

# Build stocks
stocks_data = []
for code, name in STOCKS.items():
    m = market.get(code,{})
    cnt = sum(1 for r in all_reports if r.get("code")==code)
    ratings = [r["rating"] for r in all_reports if r.get("code")==code and r.get("rating")]
    cons = "买入" if sum(1 for x in ratings if "买入" in str(x)) > len(ratings)*0.4 else ("增持" if ratings else "")
    stocks_data.append({
        "code":code,"name":name,"module":SM.get(code,"总览"),
        "report_count":cnt,"price":m.get("price"),"pe_ttm":m.get("pe_ttm"),
        "pb":m.get("pb"),"mcap_yi":m.get("mcap_yi"),
        "change_pct":m.get("change_pct"),"consensus_rating":cons,
    })

now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
output = {
    "meta":{
        "total_reports":len(all_reports),"reports_2026":len(all_reports),
        "stocks_count":19,"fetch_date":now[:10],"updated_at":now,
        "source":"东方财富 reportapi.eastmoney.com (2026年真实研报)",
        "description":f"人形机器人产业链深度研报合集（{len(all_reports)}篇2026年研报，全部来自东财真实数据），覆盖19家核心标的",
    },
    "modules":modules,"stocks":stocks_data,
}

path = "C:/Users/HBH/Desktop/HBH_Vibe-Trading-master/HBH_Vibe-Trading-master/frontend/public/data/robot_research.json"
with open(path,"w",encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\n=== 2026 Total: {len(all_reports)} reports ===")
for mid, md in modules.items():
    print(f"  {md['title']}: {md['report_count']}")
for s in sorted(stocks_data, key=lambda x:-x["report_count"]):
    if s["report_count"] > 0:
        print(f"  {s['code']} {s['name']}: {s['report_count']}")
print(f"\nSaved to {path}")
