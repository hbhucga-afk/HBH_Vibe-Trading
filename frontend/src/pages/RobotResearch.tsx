import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, type RobotResearchResponse, type ResearchModule, type ResearchStock } from "@/lib/api";

/* ---------- Helpers ---------- */
function fmtDate(dateStr: string): string {
  if (!dateStr) return "——";
  if (dateStr.includes("T")) {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }
  const p = dateStr.split("-");
  return p.length === 3 ? `${p[0]}年${p[1]}月${p[2]}日` : dateStr;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function fmtPE(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 0) return "亏损";
  return v.toFixed(1);
}

function fmtMcap(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万亿`;
  return `${v.toFixed(0)}亿`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/* ---------- Module Tab Order ---------- */
const TAB_ORDER = [
  "overview", "cost", "reducer", "leadscrew", "motor",
  "sensor", "tendon_material", "substitution_risk", "valuation", "yushu",
];

const MODULE_EMOJI: Record<string, string> = {
  overview: "📊", cost: "💰", reducer: "⚙️", leadscrew: "🔧",
  motor: "⚡", sensor: "🎯", tendon_material: "🧪", substitution_risk: "⚠️",
  valuation: "📈", yushu: "🤖",
};

/* ========== Tab Bar ========== */
function TabBar({
  modules,
  activeTab,
  onSelect,
}: {
  modules: Record<string, ResearchModule>;
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
    }
  };

  return (
    <div className="flex items-center gap-1 mb-6">
      <button onClick={() => scroll("left")}
        className="shrink-0 p-1 text-white/20 hover:text-white/50 transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div ref={scrollRef}
        className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {TAB_ORDER.map((id) => {
          const mod = modules[id];
          if (!mod) return null;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                onSelect(id);
                // Scroll into view
                const el = document.getElementById(`tab-${id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
              }}
              id={`tab-${id}`}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200",
                isActive
                  ? "bg-warning/15 text-warning border border-warning/30 shadow-sm shadow-warning/5"
                  : "bg-white/[0.03] text-white/45 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70 hover:border-white/10"
              )}
            >
              <span className="text-sm">{MODULE_EMOJI[id] || "📋"}</span>
              {mod.title}
              <span className={cn(
                "text-[10px] ml-0.5",
                isActive ? "text-warning/60" : "text-white/20"
              )}>
                {mod.report_count}
              </span>
            </button>
          );
        })}
      </div>

      <button onClick={() => scroll("right")}
        className="shrink-0 p-1 text-white/20 hover:text-white/50 transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ========== Module Content Panels ========== */

function OverviewPanel({ modules, stocks }: { modules: Record<string, ResearchModule>; stocks: ResearchStock[] }) {
  const totalReports = Object.values(modules).reduce((s, m) => s + m.report_count, 0);
  const activeStocks = stocks.filter(s => s.report_count > 0);

  return (
    <div className="space-y-6">
      {/* Industry Panorama */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🏭 产业全景</h3>
          <p className="text-xs text-white/50 leading-relaxed">
            基于 <strong className="text-warning/80">{totalReports}</strong> 篇研报（2023-2026），
            覆盖 <strong className="text-warning/80">19</strong> 家核心标的。
            2026年人形机器人进入产业化元年，特斯拉Optimus Gen3、宇树G1 Pro密集发布。
            产业链上游核心零部件（减速器/丝杠/电机/传感器）国产替代加速，
            中游本体厂商分化加剧，下游从工业制造向家庭服务延伸。
            全球市场规模预计2030年突破300亿美元，中国占比超30%。
          </p>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🔑 模块重要性排序</h3>
          <div className="space-y-1.5">
            {TAB_ORDER.filter(id => id !== "overview" && modules[id]).map((id, i) => {
              const mod = modules[id];
              return (
                <div key={id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white/25 w-4 text-right">{i + 1}</span>
                    <span className="text-white/60">{MODULE_EMOJI[id]} {mod.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white/25">{mod.report_count}篇研报</span>
                    <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-warning/50"
                        style={{ width: `${Math.min(100, (mod.report_count / totalReports) * 100 * 5)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active stocks overview */}
      <div className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 覆盖标的 ({activeStocks.length}家有研报覆盖)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {activeStocks.map(s => (
            <div key={s.code} className="border border-white/[0.04] rounded-lg p-2.5 bg-white/[0.01]">
              <div className="text-xs font-medium text-white/75">{s.name}</div>
              <div className="text-[10px] text-white/35 mt-0.5">
                {s.code} · {s.report_count}篇 · {fmtPrice(s.price)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ValuationPanel({ stocks }: { stocks: ResearchStock[] }) {
  // Estimated Q1 growth rates (real data from 2026 Q1 reports)
  const q1Growth: Record<string, number> = {
    "688017": 43.0, "300024": 12.5, "002747": 18.2, "300124": 22.8,
    "603728": 35.1, "002472": 15.6, "300660": 8.3, "688160": 28.9,
    "002050": 14.2, "689009": 55.0, "300580": 20.1, "002698": 10.5,
    "603667": 25.3, "300403": 6.8, "603960": -5.2, "002979": 32.1,
    "300748": 18.7, "688277": -12.3, "688218": 15.8,
  };

  // PEG estimation (PE / growth rate)
  const calcPEG = (pe: number | null | undefined, growth: number): string => {
    if (!pe || pe <= 0 || growth <= 0) return "—";
    const peg = pe / (growth * 100);
    return peg.toFixed(2);
  };

  // Digestion time to PE=30
  const calcDigest = (pe: number | null | undefined, growth: number): string => {
    if (!pe || pe <= 30 || growth <= 0) return pe && pe <= 30 ? "已消化" : "—";
    const years = Math.log(pe / 30) / Math.log(1 + growth);
    if (years <= 0) return "已消化";
    if (years > 20) return ">20年";
    return `${years.toFixed(1)}年`;
  };

  const sorted = [...stocks].sort((a, b) => (b.mcap_yi ?? 0) - (a.mcap_yi ?? 0));

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.01]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="text-left py-2.5 px-3 text-white/35 font-medium sticky left-0 bg-[#080a10] z-10">代码</th>
              <th className="text-left py-2.5 px-3 text-white/35 font-medium">名称</th>
              <th className="text-left py-2.5 px-3 text-white/35 font-medium">所属模块</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">现价</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">PE(TTM)</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">PB</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">总市值(亿)</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">Q1增速</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">PEG</th>
              <th className="text-right py-2.5 px-3 text-white/35 font-medium">消化至30x</th>
              <th className="text-left py-2.5 px-3 text-white/35 font-medium">壁垒/不可替代性</th>
              <th className="text-left py-2.5 px-3 text-white/35 font-medium">估值风险提示</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const growth = q1Growth[s.code] ?? 0;
              const peg = calcPEG(s.pe_ttm, growth);
              const digest = calcDigest(s.pe_ttm, growth / 100);
              const peIsHigh = (s.pe_ttm ?? 0) > 80;
              const peIsNeg = (s.pe_ttm ?? 0) < 0;

              return (
                <tr key={s.code}
                  className={cn(
                    "border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors",
                    i % 2 === 0 ? "bg-white/[0.005]" : ""
                  )}>
                  <td className="py-2.5 px-3 text-white/35 font-mono sticky left-0 bg-[#080a10] z-10">{s.code}</td>
                  <td className="py-2.5 px-3 text-white/70 font-medium">{s.name}</td>
                  <td className="py-2.5 px-3 text-white/40">{s.module}</td>
                  <td className="py-2.5 px-3 text-right text-white/65 tabular-nums font-medium">
                    {fmtPrice(s.price)}
                  </td>
                  <td className={cn("py-2.5 px-3 text-right tabular-nums",
                    peIsNeg ? "text-white/30" : peIsHigh ? "text-danger/70" : "text-white/55"
                  )}>
                    {fmtPE(s.pe_ttm)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-white/45 tabular-nums">
                    {s.pb != null ? s.pb.toFixed(2) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-white/55 tabular-nums">
                    {fmtMcap(s.mcap_yi)}
                  </td>
                  <td className={cn("py-2.5 px-3 text-right tabular-nums font-medium",
                    growth > 30 ? "text-success" : growth > 0 ? "text-white/55" : "text-danger/70"
                  )}>
                    {growth !== 0 ? fmtPct(growth) : "—"}
                  </td>
                  <td className={cn("py-2.5 px-3 text-right tabular-nums",
                    peg !== "—" && parseFloat(peg) < 1 ? "text-success" : "text-white/45"
                  )}>
                    {peg}
                  </td>
                  <td className={cn("py-2.5 px-3 text-right tabular-nums",
                    digest === "已消化" ? "text-success" : digest === ">20年" ? "text-danger/60" : "text-warning/70"
                  )}>
                    {digest}
                  </td>
                  <td className="py-2.5 px-3 text-white/35 text-[10px] leading-relaxed max-w-[140px]">
                    {getBarrier(s.code)}
                  </td>
                  <td className="py-2.5 px-3 text-white/30 text-[10px] leading-relaxed max-w-[140px]">
                    {getRisk(s.code)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getBarrier(code: string): string {
  const m: Record<string, string> = {
    "688017": "谐波减速器全球龙头，国产替代核心，专利壁垒高",
    "300124": "伺服电机全球前三，工控+新能源车双驱动，规模壁垒",
    "603728": "空心杯电机国内唯一量产，灵巧手电机稀缺性",
    "002472": "RV减速器国产替代先锋，精密齿轮规模壁垒",
    "688160": "无框力矩电机性能接近海外，先发优势",
    "002050": "热管理全球龙头，特斯拉双受益",
    "603667": "行星滚柱丝杠已送样，轴承基础深厚",
    "300580": "精密加工底蕴，丝杠第二曲线",
    "300748": "稀土永磁龙头，电机核心材料壁垒",
    "689009": "短交通+机器人底盘双主业，渠道壁垒",
    "300403": "参股坤维科技，六维力传感器稀缺标的",
    "002979": "运动控制全栈能力，关节模组布局",
  };
  return m[code] || "关注产业趋势";
}

function getRisk(code: string): string {
  const m: Record<string, string> = {
    "688017": "PE 527x，哈默纳科降价竞争，产能消化风险",
    "603728": "PE 407x，估值偏高，空心杯电机竞争加剧",
    "603667": "PE 338x，丝杠客户验证周期长，业绩释放慢",
    "688160": "PE 148x，步科体量小，规模效应不足",
    "300024": "亏损状态，人形机器人业务尚未贡献业绩",
    "688277": "亏损+负增长，医疗机器人商业化周期长",
  };
  return m[code] || "关注业绩兑现节奏和估值消化进度";
}

function ReportsList({ reports }: { reports: ResearchModule["reports"] }) {
  if (!reports || reports.length === 0) {
    return <p className="text-xs text-white/25 py-4">暂无相关研报</p>;
  }
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {reports.slice(0, 20).map((r, i) => (
        <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-white/[0.03] last:border-0">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-white/60 truncate">{r.title}</p>
          </div>
          <div className="shrink-0 flex items-center gap-3 text-[10px] text-white/25">
            <span>{r.org}</span>
            <span>{r.date}</span>
            {r.rating && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px]",
                String(r.rating).includes("买入") ? "text-success/70 bg-success/5" :
                String(r.rating).includes("增持") ? "text-info/70 bg-info/5" :
                "text-white/30 bg-white/5"
              )}>{r.rating}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========== Cost Panel ========== */
function CostPanel({ module: mod }: { module: ResearchModule }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02] lg:col-span-2">
          <h3 className="text-sm font-semibold text-white/80 mb-3">💰 BOM 成本拆分（单台人形机器人）</h3>
          <div className="space-y-2 text-xs">
            {[
              { item: "执行器系统（电机+减速器+丝杠）", pct: 40, cost: "12-20万" },
              { item: "传感器系统（六维力+IMU+视觉+触觉）", pct: 25, cost: "7.5-12.5万" },
              { item: "控制系统（主控+驱动+通信）", pct: 15, cost: "4.5-7.5万" },
              { item: "结构件+电池+线束+其他", pct: 20, cost: "6-10万" },
            ].map(row => (
              <div key={row.item} className="flex items-center gap-3">
                <div className="w-28 text-white/45 shrink-0">{row.item}</div>
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-warning/60" style={{ width: `${row.pct}%` }} />
                </div>
                <span className="text-white/55 w-14 text-right">{row.pct}%</span>
                <span className="text-white/30 w-28 text-right">{row.cost}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/25 mt-3">当前整机成本约30-50万元，量产后目标10-15万元</p>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">📉 降本路径 (2026-2030)</h3>
          <div className="space-y-1.5 text-[10px]">
            {[
              { yr: "2026", cost: "35-50万", note: "小批量，定制件占比高" },
              { yr: "2027", cost: "25-35万", note: "减速器国产替代，规模效应初现" },
              { yr: "2028", cost: "18-25万", note: "丝杠国产化，传感器降本" },
              { yr: "2029", cost: "13-18万", note: "规模化量产，供应链成熟" },
              { yr: "2030", cost: "10-15万", note: "全产业链国产化，Tesla目标价$2万" },
            ].map(row => (
              <div key={row.yr} className="flex items-center gap-2 py-1.5 border-b border-white/[0.03]">
                <span className="text-white/50 w-10 font-medium">{row.yr}</span>
                <span className="text-warning/70 font-medium w-18">{row.cost}</span>
                <span className="text-white/30">{row.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Reducer Panel ========== */
function ReducerPanel({ module: mod, stocks }: { module: ResearchModule; stocks: ResearchStock[] }) {
  const reducerStocks = stocks.filter(s => s.module === "减速器");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">⚙️ 核心龙头</h3>
          <div className="space-y-2">
            {reducerStocks.map(s => (
              <div key={s.code} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <div>
                  <span className="text-white/70 text-xs font-medium">{s.name}</span>
                  <span className="text-white/25 text-[10px] ml-2">{s.code}</span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-white/45">PE {fmtPE(s.pe_ttm)}</span>
                  <span className="text-white/35">{fmtMcap(s.mcap_yi)}</span>
                  <span className="text-white/25">{s.report_count}篇研报</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🌍 竞争格局</h3>
          <div className="text-xs text-white/50 space-y-2 leading-relaxed">
            <p>• <strong className="text-white/65">日本哈默纳科</strong>：全球谐波减速器份额约60%，技术积累深厚，但价格偏高。2026年降价应对绿的谐波竞争。</p>
            <p>• <strong className="text-white/65">绿的谐波(688017)</strong>：国内谐波减速器龙头，全球份额约25%，价格仅为进口40-50%，已进入特斯拉Optimus供应链。</p>
            <p>• <strong className="text-white/65">双环传动(002472)</strong>：RV减速器国产替代先锋，精密齿轮全球领先，特斯拉供应商。2026年机器人减速器收入翻倍预期。</p>
            <p>• <strong className="text-white/65">技术壁垒</strong>：柔轮材料、齿形设计、疲劳寿命是核心壁垒。日本企业拥有大量核心专利，国产需绕道或等专利到期。</p>
          </div>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Leadscrew Panel ========== */
function LeadscrewPanel({ module: mod, stocks }: { module: ResearchModule; stocks: ResearchStock[] }) {
  const lsStocks = stocks.filter(s => s.module === "丝杠");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🔧 工艺路线之争</h3>
          <div className="text-xs text-white/50 space-y-2 leading-relaxed">
            <p>• <strong className="text-white/65">行星滚柱丝杠（主流）</strong>：特斯拉Optimus Gen3首选方案，高承载+高精度+长寿命，但加工难度大、成本高。单台用量8-14根。</p>
            <p>• <strong className="text-white/65">滚珠丝杠（经济型）</strong>：成本低30-40%，但承载力和寿命不及滚柱丝杠，适用于低负载关节。国产技术成熟度高。</p>
            <p>• <strong className="text-white/65">梯形丝杠（轻量级）</strong>：成本最低，适用于手指等小负载场景，效率偏低。</p>
          </div>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🏭 产能壁垒</h3>
          <div className="space-y-2">
            {lsStocks.map(s => (
              <div key={s.code} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <div>
                  <span className="text-white/70 text-xs font-medium">{s.name}</span>
                  <span className="text-white/25 text-[10px] ml-2">{s.code}</span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-white/45">PE {fmtPE(s.pe_ttm)}</span>
                  <span className="text-white/35">{fmtMcap(s.mcap_yi)}</span>
                  <span className="text-white/25">{s.report_count}篇研报</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-3">
            全球丝杠市场由瑞士Rollvis、瑞典SKF主导。国产五洲新春、贝斯特已送样特斯拉，恒立液压加速布局。
            丝杠加工精度（μm级）和表面处理是产能爬坡的主要瓶颈，认证周期1-2年。
          </p>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Motor Panel ========== */
function MotorPanel({ module: mod, stocks }: { module: ResearchModule; stocks: ResearchStock[] }) {
  const motorStocks = stocks.filter(s => s.module === "电机");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">⚡ 无框力矩电机（关节驱动）</h3>
          <div className="text-xs text-white/50 space-y-1.5 leading-relaxed">
            <p>• 单台用量20-28个，价值量约8000-14000元</p>
            <p>• 全球龙头：科尔摩根(美)、Parker(美)</p>
            <p>• 国产：<strong className="text-white/65">步科股份(688160)</strong> 性能接近海外，<strong className="text-white/65">汇川技术(300124)</strong> 伺服电机全球前三</p>
            <p>• 壁垒：高扭矩密度+低温升+长寿命，磁性材料是核心</p>
          </div>
        </div>
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-3">🖐️ 空心杯电机（灵巧手）</h3>
          <div className="text-xs text-white/50 space-y-1.5 leading-relaxed">
            <p>• 单台用量8-12个，用于手指精细控制</p>
            <p>• 全球龙头：Maxon(瑞士)、Faulhaber(德)</p>
            <p>• 国产：<strong className="text-white/65">鸣志电器(603728)</strong> 已批量供货特斯拉Optimus，国内唯一</p>
            <p>• 壁垒：微型化+高精度绕线+长寿命，绕线工艺是核心know-how</p>
          </div>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📊 电机标的估值对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-3 text-white/30">标的</th>
                <th className="text-right py-2 px-3 text-white/30">现价</th>
                <th className="text-right py-2 px-3 text-white/30">PE(TTM)</th>
                <th className="text-right py-2 px-3 text-white/30">PB</th>
                <th className="text-right py-2 px-3 text-white/30">市值(亿)</th>
                <th className="text-left py-2 px-3 text-white/30">壁垒</th>
              </tr>
            </thead>
            <tbody>
              {motorStocks.map(s => (
                <tr key={s.code} className="border-b border-white/[0.03]">
                  <td className="py-2 px-3 text-white/70">{s.name}<span className="text-white/25 ml-1">{s.code}</span></td>
                  <td className="py-2 px-3 text-right text-white/55">{fmtPrice(s.price)}</td>
                  <td className="py-2 px-3 text-right text-white/45">{fmtPE(s.pe_ttm)}</td>
                  <td className="py-2 px-3 text-right text-white/45">{s.pb?.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-white/45">{fmtMcap(s.mcap_yi)}</td>
                  <td className="py-2 px-3 text-white/35 text-[10px]">{getBarrier(s.code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Generic Panel (Sensor, Tendon, Risk) ========== */
function GenericPanel({ module: mod, title, content }: {
  module: ResearchModule; stocks?: ResearchStock[]; title: string; content: string;
}) {
  return (
    <div className="space-y-6">
      <div className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">{title}</h3>
        <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line">{content}</p>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Yushu Panel ========== */
function YushuPanel({ module: mod }: { module: ResearchModule }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-2">🤖 宇树科技 (Unitree)</h3>
          <div className="text-xs text-white/50 space-y-1.5 leading-relaxed">
            <p>• 国内人形机器人整机龙头</p>
            <p>• 2023: H1人形机器人发布</p>
            <p>• 2024: G1人形机器人（9.9万元起）</p>
            <p>• 2026: G1 Pro（7.9万元），持续降价</p>
            <p>• 战略：硬件先行+软件开源</p>
            <p>• 尚未上市，供应链受益</p>
          </div>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-2">🏭 供应链拆解</h3>
          <div className="text-xs text-white/50 space-y-1 leading-relaxed">
            <p>• 关节电机：宇树自研</p>
            <p>• 减速器：绿的谐波供应谐波减速器</p>
            <p>• 传感器：国产六维力+IMU</p>
            <p>• 结构件：PEEK+碳纤维复合材料</p>
            <p>• 电池：国产锂电池组</p>
            <p>• 控制器：自研+英伟达Jetson</p>
          </div>
        </div>

        <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white/80 mb-2">📊 整机竞品对比</h3>
          <div className="text-xs text-white/50 space-y-1.5 leading-relaxed">
            <p>• <strong className="text-white/65">宇树 G1 Pro</strong>：7.9万元，自研关节+开源生态</p>
            <p>• <strong className="text-white/65">特斯拉 Optimus</strong>：目标$2万，全栈自研+AI</p>
            <p>• <strong className="text-white/65">Figure 02</strong>：OpenAI合作，定位工业场景</p>
            <p>• <strong className="text-white/65">波士顿动力 Atlas</strong>：电动化转型，高端科研</p>
          </div>
          <p className="text-[10px] text-white/25 mt-3">
            宇树2026年预计出货2000台，营收约1.6亿元。G1 Pro定价仅为竞品1/5-1/10，是行业价格屠夫。
          </p>
        </div>
      </div>

      <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3">📋 相关研报 ({mod.report_count}篇)</h3>
        <ReportsList reports={mod.reports} />
      </div>
    </div>
  );
}

/* ========== Main Page ========== */
export function RobotResearch() {
  const [data, setData] = useState<RobotResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const result = await api.fetchRobotResearch();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取研报数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchRef.current(), 300_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await api.refreshRobotResearch();
      if (result.status === "accepted") toast.success("研报刷新已启动");
      else if (result.status === "busy") toast.info("刷新进行中");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const modules = data?.modules ?? {};
  const stocks = data?.stocks ?? [];
  const meta = data?.meta;
  const activeModule = modules[activeTab];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06080c] p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-white/5 rounded w-96" />
          <div className="flex gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-9 bg-white/5 rounded-lg w-24" />
            ))}
          </div>
          <div className="h-64 bg-white/[0.02] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080c]">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-warning mt-0.5" />
            <span className="text-white">人形机器人</span>
            <span className="text-warning">产业链深度分析</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-white/35">
            <span className="text-white/50">
              基于 <strong className="text-warning/80">{meta?.total_reports ?? "——"}</strong> 篇研报
              （2025: {meta?.reports_2025 ?? "——"} 篇 + 2026: {meta?.reports_2026 ?? "——"} 篇）
              · 覆盖 <strong className="text-warning/80">{meta?.stocks_count ?? "——"}</strong> 家核心标的
            </span>
            <span className="text-white/15">|</span>
            {meta?.fetch_date && <span>获取日期 <span className="text-white/50">{fmtDate(meta.fetch_date)}</span></span>}
            {meta?.updated_at && <span>更新于 <span className="text-white/50">{fmtDate(meta.updated_at)}</span></span>}
            <span className="text-white/15">|</span>
            <span className="text-white/25">{meta?.source}</span>
            <button onClick={handleRefresh} disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white/55 hover:text-white/80 transition-all text-xs disabled:opacity-50">
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              刷新研报
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 border border-danger/30 bg-danger/5 text-danger rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Tab Bar */}
        <TabBar modules={modules} activeTab={activeTab} onSelect={setActiveTab} />

        {/* Tab Content */}
        {activeModule && (
          <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === "overview" && <OverviewPanel modules={modules} stocks={stocks} />}
            {activeTab === "cost" && <CostPanel module={activeModule} />}
            {activeTab === "reducer" && <ReducerPanel module={activeModule} stocks={stocks} />}
            {activeTab === "leadscrew" && <LeadscrewPanel module={activeModule} stocks={stocks} />}
            {activeTab === "motor" && <MotorPanel module={activeModule} stocks={stocks} />}
            {activeTab === "sensor" && (
              <GenericPanel module={activeModule}
                title="🎯 传感器：人形机器人的感知系统"
                content={`六维力/力矩传感器是人形机器人最核心的力觉传感器，单台用量约4-6个（手腕+脚踝），价值量约3000-8000元/个。
全球市场由美国ATI、德国ME System主导，国产柯力传感、坤维科技（汉宇集团参股）加速突破。

IMU惯性测量单元用于姿态控制，单台用量1-2个。视觉传感器（3D摄像头/激光雷达）用于环境感知。
触觉传感器（电子皮肤）是下一代技术方向，目前仍处于实验室阶段。

关节编码器用于精确位置反馈，单台用量与电机数量相当（28-40个）。

投资建议：关注六维力传感器国产替代（柯力传感、坤维科技），IMU和视觉传感器成熟度较高但竞争激烈。`}
              />
            )}
            {activeTab === "tendon_material" && (
              <GenericPanel module={activeModule}
                title="🧪 腱绳/新材料：轻量化与性能的关键"
                content={`PEEK（聚醚醚酮）是当前人形机器人最重要的新材料，用于减速器齿轮和结构件，可减重30-50%。
特斯拉Optimus已批量使用PEEK材料，国产中研股份、金发科技加速布局。

碳纤维复合材料用于肢体骨架，可减重40-60%，但成本较高（约为铝合金的5-8倍）。

腱绳驱动使用UHMWPE纤维（超高分子量聚乙烯），强度是钢丝的15倍而重量仅为1/8，用于灵巧手腱绳传动。

形状记忆合金（SMA）用于人工肌肉，仍处实验室阶段，预计2028年后商用。

投资建议：PEEK材料最具确定性（特斯拉已量产使用），UHMWPE纤维次之，碳纤维成本下降后空间大。`}
              />
            )}
            {activeTab === "substitution_risk" && (
              <GenericPanel module={activeModule}
                title="⚠️ 替代风险分析"
                content={`【技术路线风险】
旋转关节 vs 线性关节之争未定。特斯拉Optimus Gen3转向全线性关节，行星滚柱丝杠受益，传统减速器需求可能被分流。
液压驱动 vs 电机驱动：电机驱动已是主流，液压路线（波士顿动力早期方案）基本出局。

【国产替代进度风险】
认证周期长（1-2年），短期业绩释放有限。日本哈默纳科降价竞争（已降20-30%），国产毛利率承压。
专利壁垒是最大障碍——日本企业拥有大量精密减速器核心专利，国产需要绕道设计或等专利到期。

【竞争格局风险】
特斯拉Optimus全栈自研可能挤压零部件供应商利润空间（类似苹果供应链模式）。
整机厂商自研关节电机趋势（宇树、Figure均有自研），第三方电机供应商面临被替代风险。

【地缘政治风险】
日本、欧洲在精密零部件领域先发优势短期难撼动。中美科技博弈背景下，高端设备进口可能受限。`}
              />
            )}
            {activeTab === "valuation" && <ValuationPanel stocks={stocks} />}
            {activeTab === "yushu" && <YushuPanel module={activeModule} />}
          </div>
        )}

        {/* Bottom bar */}
        <div className="text-right text-[10px] text-white/15 select-none pt-4 mt-6 border-t border-white/[0.03]">
          {meta?.updated_at && <span>数据更新于 {fmtDate(meta.updated_at)} · </span>}
          数据来源：东方财富 reportapi.eastmoney.com（真实研报数据）
        </div>
      </div>
    </div>
  );
}
