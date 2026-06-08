import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type GoldNewsItem, type GoldNarrativeModule, type GoldAccumulationPlan, type PriceBar } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/CandlestickChart";
import { echarts } from "@/lib/echarts";
import { getChartTheme } from "@/lib/chart-theme";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Newspaper,
  BookOpen,
  PiggyBank,
  Settings,
  Play,
  Pause,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Banknote,
  Globe,
  Scale,
  BarChart4,
  LineChart,
  Calendar,
  Info,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Gold price card                                                    */
/* ------------------------------------------------------------------ */

function GoldPriceCard({ label, price, changePct, unit, accent }: {
  label: string;
  price: number | null;
  changePct: number | null;
  unit: string;
  accent?: boolean;
}) {
  const up = changePct != null && changePct > 0;
  const down = changePct != null && changePct < 0;
  const color = up ? "text-danger" : down ? "text-success" : "text-muted-foreground";

  return (
    <div className={cn(
      "border rounded-xl p-5 bg-card flex flex-col gap-2 min-w-[200px] flex-1 transition-shadow hover:shadow-md",
      accent && "ring-2 ring-primary/20",
    )}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted">{unit}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {price != null ? price.toFixed(2) : "—"}
        </span>
        {up && <TrendingUp className="h-4 w-4 text-danger" />}
        {down && <TrendingDown className="h-4 w-4 text-success" />}
      </div>
      <div className={cn("text-sm font-medium tabular-nums", color)}>
        {changePct != null ? (
          <>{changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%</>
        ) : "—"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Intraday line chart (分时图)                                        */
/* ------------------------------------------------------------------ */

function IntradayChart({ bars }: { bars: PriceBar[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const { dark } = useDarkMode();

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, [bars.length === 0, dark]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;

    const t = getChartTheme();
    const times = bars.map(b => b.time);
    const prices = bars.map(b => b.close);

    // Base price for change % (first bar open)
    const basePrice = bars[0].open || prices[0];

    // Price line
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (params: { axisValue: string; value: number }[]) => {
          if (!params?.length) return "";
          const p = params[0];
          const chg = basePrice ? ((p.value - basePrice) / basePrice * 100).toFixed(2) : "0.00";
          return `<b>${p.axisValue}</b><br/>价格: ${p.value.toFixed(2)}<br/>涨幅: ${chg >= "0" ? "+" : ""}${chg}%`;
        },
      },
      grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: times,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 9, showMaxLabel: true, showMinLabel: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: t.gridColor, type: "dashed" } },
        axisLabel: { color: t.textColor, fontSize: 9 },
      },
      series: [
        {
          type: "line",
          data: prices,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#f59e0b", width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(245, 158, 11, 0.25)" },
                { offset: 1, color: "rgba(245, 158, 11, 0.02)" },
              ],
            },
          },
          markLine: basePrice ? {
            silent: true,
            data: [{ yAxis: basePrice, label: { formatter: "开盘 " + basePrice.toFixed(2), color: t.textColor, fontSize: 9 } }],
            lineStyle: { color: t.axisColor, type: "dashed", width: 1 },
          } : undefined,
        },
      ],
    }, true);
  }, [bars, dark]);

  if (bars.length === 0) {
    return <div className="text-muted-foreground text-sm p-4 text-center">暂无分时数据</div>;
  }

  return <div ref={containerRef} style={{ height: 220 }} />;
}

/* ------------------------------------------------------------------ */
/*  News card                                                          */
/* ------------------------------------------------------------------ */

function NewsCard({ item }: { item: GoldNewsItem }) {
  const sentimentIcon = item.sentiment === "bullish"
    ? <TrendingUp className="h-3 w-3 text-danger" />
    : item.sentiment === "bearish"
      ? <TrendingDown className="h-3 w-3 text-success" />
      : <Minus className="h-3 w-3 text-muted-foreground" />;

  const sentimentLabel = item.sentiment === "bullish" ? "利多" : item.sentiment === "bearish" ? "利空" : "中性";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug flex-1">{item.title}</p>
        <span className={cn(
          "shrink-0 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1",
          item.sentiment === "bullish" ? "bg-danger/10 text-danger" :
          item.sentiment === "bearish" ? "bg-success/10 text-success" :
          "bg-muted text-muted-foreground",
        )}>
          {sentimentIcon}
          {sentimentLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
        <span>{item.source}</span>
        <span>·</span>
        <span>{item.time}</span>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Narrative card                                                     */
/* ------------------------------------------------------------------ */

function NarrativeCard({ module, expanded, onToggle }: {
  module: GoldNarrativeModule;
  expanded: boolean;
  onToggle: () => void;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    "bank": <Banknote className="h-4 w-4" />,
    "chart-up": <BarChart4 className="h-4 w-4" />,
    "globe": <Globe className="h-4 w-4" />,
    "scale": <Scale className="h-4 w-4" />,
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {iconMap[module.icon] || <Info className="h-4 w-4" />}
          </div>
          <div>
            <span className="text-sm font-semibold">{module.title}</span>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{module.summary}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t">
          <p className="text-sm text-muted-foreground mt-3">{module.summary}</p>
          <ul className="mt-3 space-y-1.5">
            {module.key_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gold accumulation plan (同花顺积存金)                               */
/* ------------------------------------------------------------------ */

function GoldAccumulationPanel() {
  const [plan, setPlan] = useState<GoldAccumulationPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [amount, setAmount] = useState(100);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [profitTarget, setProfitTarget] = useState(5);
  const [stopLoss, setStopLoss] = useState(3);

  useEffect(() => {
    api.fetchGoldAccumulation()
      .then((res) => {
        setPlan(res.plan);
        setAmount(res.plan.amount_cny);
        setFrequency(res.plan.frequency);
        setMaxPrice(res.plan.max_price_cny_per_g != null ? String(res.plan.max_price_cny_per_g) : "");
        setProfitTarget(res.plan.auto_sell_profit_pct);
        setStopLoss(Math.abs(res.plan.auto_sell_stop_pct));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const savePlan = useCallback(async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const updated = {
        ...plan,
        amount_cny: amount,
        frequency,
        max_price_cny_per_g: maxPrice ? parseFloat(maxPrice) : null,
        auto_sell_profit_pct: profitTarget,
        auto_sell_stop_pct: -stopLoss,
      };
      const res = await api.saveGoldAccumulation(updated);
      setPlan(res.plan);
      setEditing(false);
    } catch { /* ignore */ }
    setSaving(false);
  }, [plan, amount, frequency, maxPrice, profitTarget, stopLoss]);

  const toggleActive = useCallback(async () => {
    if (!plan) return;
    const newStatus: "active" | "paused" = plan.plan_status === "active" ? "paused" : "active";
    const res = await api.saveGoldAccumulation({
      ...plan,
      plan_status: newStatus,
      accumulation_enabled: newStatus === "active",
    });
    setPlan(res.plan);
  }, [plan]);

  if (loading) {
    return (
      <div className="border rounded-xl bg-card p-5 animate-pulse space-y-3">
        <div className="h-5 bg-muted rounded w-32" />
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-40" />
      </div>
    );
  }

  const freqLabel = frequency === "daily" ? "每日" : frequency === "weekly" ? "每周" : "每月";
  const isActive = plan?.plan_status === "active";

  return (
    <div className="border rounded-xl bg-card">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">同花顺 · 黄金积存金</h3>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={savePlan}
                  disabled={saving}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 text-xs font-medium rounded-md border hover:bg-muted transition-colors"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleActive}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-success/10 text-success hover:bg-success/20"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {isActive ? "暂停" : "启动"}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1 text-xs font-medium rounded-md border hover:bg-muted transition-colors"
                >
                  <Settings className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Plan status badge */}
        <div className="flex items-center gap-2 mt-3">
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium",
            isActive ? "bg-success/10 text-success" : plan?.plan_status === "paused" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
          )}>
            {isActive ? "运行中" : plan?.plan_status === "paused" ? "已暂停" : "未启动"}
          </span>
          {isActive && plan?.next_execution && (
            <span className="text-[10px] text-muted-foreground">
              下次执行: {plan.next_execution}
            </span>
          )}
        </div>

        {/* Summary */}
        {!editing && plan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">每期金额</p>
              <p className="text-lg font-bold tabular-nums mt-1">¥{plan.amount_cny.toFixed(0)}</p>
              <p className="text-[10px] text-muted-foreground">{freqLabel}</p>
            </div>
            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">累计投入</p>
              <p className="text-lg font-bold tabular-nums mt-1">¥{plan.total_invested.toFixed(0)}</p>
            </div>
            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">持有黄金</p>
              <p className="text-lg font-bold tabular-nums mt-1">{plan.current_holding_g.toFixed(2)}g</p>
            </div>
            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">平均成本</p>
              <p className="text-lg font-bold tabular-nums mt-1">¥{plan.avg_cost.toFixed(2)}/g</p>
            </div>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">每期定投金额 (CNY)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  min={10}
                  step={10}
                  className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">定投频率</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as "daily" | "weekly" | "monthly")}
                  className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">触发买入最高价 (CNY/g, 留空免限制)</label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="留空不限"
                  step={0.01}
                  className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">自动止盈 %</label>
                  <input
                    type="number"
                    value={profitTarget}
                    onChange={(e) => setProfitTarget(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.5}
                    className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">自动止损 %</label>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.5}
                    className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>积存金定投将通过同花顺账户自动执行。止盈/止损触发时将自动卖出持仓。请确保同花顺账户已授权且余额充足。</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gold page                                                          */
/* ------------------------------------------------------------------ */

export function Gold() {
  const [spotPrice, setSpotPrice] = useState<{ price: number | null; changePct: number | null }>({ price: null, changePct: null });
  const [klines, setKlines] = useState<PriceBar[]>([]);
  const [intraday, setIntraday] = useState<PriceBar[]>([]);
  const [news, setNews] = useState<GoldNewsItem[]>([]);
  const [narratives, setNarratives] = useState<GoldNarrativeModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [klineType, setKlineType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [expandedNarrative, setExpandedNarrative] = useState<string | null>(null);
  const [showNarratives, setShowNarratives] = useState(false);
  const [showAccumulation, setShowAccumulation] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [priceRes, klineRes, intradayRes, newsRes, narrativeRes] = await Promise.all([
        api.fetchGoldPrice(),
        api.fetchGoldKlines(klineType, 200),
        api.fetchGoldIntraday(),
        api.fetchGoldNews(),
        api.fetchGoldNarrative(),
      ]);
      setSpotPrice({
        price: priceRes.spot.price,
        changePct: priceRes.spot.change_pct,
      });
      setKlines(klineRes.bars ?? []);
      setIntraday(intradayRes.bars ?? []);
      setNews(newsRes.news ?? []);
      setNarratives(narrativeRes.modules ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [klineType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-amber-500" />
            黄金
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            伦敦金 · 沪金期货 · 实时行情 &amp; 投资研究
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {loading && klines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-4 w-full max-w-md">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 mt-4 space-y-4 overflow-auto">
          {/* Price cards row */}
          <div className="flex gap-3 flex-wrap">
            <GoldPriceCard
              label="伦敦金 (XAU/USD)"
              price={spotPrice.price}
              changePct={spotPrice.changePct}
              unit="USD/oz"
              accent
            />
            <GoldPriceCard
              label="沪金主连"
              price={klines.length > 0 ? klines[klines.length - 1].close : null}
              changePct={klines.length > 2 ? ((klines[klines.length - 1].close - klines[klines.length - 2].close) / klines[klines.length - 2].close * 100) : null}
              unit="CNY/g"
            />
            <div className="border rounded-xl p-5 bg-card min-w-[140px] flex-1 flex flex-col justify-center items-center gap-1">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">数据来源</p>
              <p className="text-xs font-medium">腾讯行情 / mootdx</p>
            </div>
          </div>

          {/* K-line chart */}
          <div className="border rounded-xl bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <LineChart className="h-4 w-4 text-amber-500" />
                沪金 K线图
              </h2>
              <div className="flex gap-1">
                {(["daily", "weekly", "monthly"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setKlineType(t)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                      klineType === t ? "bg-amber-500/15 text-amber-600 font-medium" : "text-muted-foreground/50 hover:text-muted-foreground",
                    )}
                  >
                    {t === "daily" ? "日线" : t === "weekly" ? "周线" : "月线"}
                  </button>
                ))}
              </div>
            </div>
            <CandlestickChart data={klines} height={400} />
          </div>

          {/* Intraday line chart */}
          <div className="border rounded-xl bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <BarChart4 className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold">沪金分时走势图（今日1分钟线）</h2>
            </div>
            <IntradayChart bars={intraday} />
          </div>

          {/* Two-column layout: News + Narrative */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* News */}
            <div className="border rounded-xl bg-card">
              <div className="p-4 pb-0">
                <div className="flex items-center gap-1.5 mb-3">
                  <Newspaper className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold">黄金相关新闻</h2>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">{news.length} 条</span>
                </div>
              </div>
              <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-auto">
                {news.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* Narrative + Accumulation */}
            <div className="space-y-4">
              {/* Narrative */}
              <div className="border rounded-xl bg-card">
                <button
                  onClick={() => setShowNarratives(!showNarratives)}
                  className="w-full p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-semibold">黄金投资逻辑</h2>
                  </div>
                  {showNarratives ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {showNarratives && (
                  <div className="px-4 pb-4 space-y-2">
                    {narratives.map((m) => (
                      <NarrativeCard
                        key={m.id}
                        module={m}
                        expanded={expandedNarrative === m.id}
                        onToggle={() => setExpandedNarrative(expandedNarrative === m.id ? null : m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Accumulation toggle */}
              <button
                onClick={() => setShowAccumulation(!showAccumulation)}
                className="w-full flex items-center gap-2 p-3 border rounded-xl bg-card hover:bg-muted/30 transition-colors"
              >
                <PiggyBank className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium flex-1 text-left">同花顺 · 黄金积存金</span>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">接入个人账户</span>
                {showAccumulation ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showAccumulation && <GoldAccumulationPanel />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
