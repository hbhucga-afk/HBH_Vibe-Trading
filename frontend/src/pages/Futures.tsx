import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type FuturesContractData, type BrokerHolding } from "@/lib/api";
import { echarts } from "@/lib/echarts";
import { getChartTheme } from "@/lib/chart-theme";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  ArrowLeftRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Contract tab                                                       */
/* ------------------------------------------------------------------ */

const CONTRACT_INFO: Record<string, { label: string; desc: string; color: string }> = {
  IF: { label: "沪深300", desc: "IF — 沪深300股指期货", color: "text-blue-500" },
  IC: { label: "中证500", desc: "IC — 中证500股指期货", color: "text-emerald-500" },
  IH: { label: "上证50",  desc: "IH — 上证50股指期货",   color: "text-purple-500" },
  IM: { label: "中证1000",desc: "IM — 中证1000股指期货", color: "text-orange-500" },
};

/* ------------------------------------------------------------------ */
/*  Broker holding bar chart                                           */
/* ------------------------------------------------------------------ */

function BrokerHoldingChart({ brokers, dark }: { brokers: BrokerHolding[]; dark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || brokers.length === 0) return;

    const t = getChartTheme();
    const names = brokers.map(b => b.broker);
    const buyOi = brokers.map(b => b.buy_oi);
    const sellOi = brokers.map(b => b.sell_oi);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (params: { seriesName: string; value: number; name: string }[]) => {
          if (!params?.length) return "";
          const name = params[0].name;
          const buyV = params[0].value;
          const sellV = params[1].value;
          const net = buyV - sellV;
          const netSign = net > 0 ? "+" : "";
          return `<b>${name}</b><br/>
            多单: ${buyV.toLocaleString()}<br/>
            空单: ${sellV.toLocaleString()}<br/>
            净持仓: <span style="color:${net > 0 ? t.downColor : t.upColor}">${netSign}${net.toLocaleString()}</span>`;
        },
      },
      grid: { left: 80, right: 20, top: 10, bottom: 40, containLabel: false },
      xAxis: {
        type: "value",
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 9, formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toLocaleString() },
        splitLine: { lineStyle: { color: t.gridColor, type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
        axisTick: { show: false },
      },
      series: [
        {
          name: "多单",
          type: "bar",
          data: buyOi,
          stack: "total",
          barWidth: "60%",
          itemStyle: { color: "#ef4444", borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            formatter: (p: { value: number }) => p.value >= 10000 ? `${(p.value/10000).toFixed(1)}万` : p.value.toLocaleString(),
            color: t.textColor,
            fontSize: 9,
          },
        },
        {
          name: "空单",
          type: "bar",
          data: sellOi,
          stack: "total",
          barWidth: "60%",
          itemStyle: { color: "#22c55e", borderRadius: [4, 0, 0, 4] },
          label: {
            show: true,
            position: "left",
            formatter: (p: { value: number }) => p.value >= 10000 ? `${(p.value/10000).toFixed(1)}万` : p.value.toLocaleString(),
            color: t.textColor,
            fontSize: 9,
          },
        },
      ],
    }, true);
  }, [brokers, dark]);

  if (brokers.length === 0) {
    return <div className="text-muted-foreground text-sm p-4 text-center">暂无席位数据</div>;
  }

  return <div ref={containerRef} style={{ height: Math.max(300, brokers.length * 28) }} />;
}

/* ------------------------------------------------------------------ */
/*  Net OI summary bar chart (all 4 contracts)                         */
/* ------------------------------------------------------------------ */

function NetOiSummaryChart({ data }: { data: Record<string, FuturesContractData> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const t = getChartTheme();
    const codes = ["IF", "IC", "IH", "IM"];
    const labels = codes.map(c => CONTRACT_INFO[c]?.label || c);
    const buyData = codes.map(c => data[c]?.summary?.total_buy_oi ?? 0);
    const sellData = codes.map(c => data[c]?.summary?.total_sell_oi ?? 0);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (params: { name?: string; value: number; seriesName?: string }[]) => {
          if (!params?.length) return "";
          const name = params[0].name || "";
          const buyV = params[0].value;
          const sellV = params[1].value;
          const net = buyV - sellV;
          const netSign = net > 0 ? "+" : "";
          return `<b>${name}</b><br/>
            总多单: ${buyV.toLocaleString()}<br/>
            总空单: ${sellV.toLocaleString()}<br/>
            净持仓: <span style="color:${net > 0 ? t.downColor : t.upColor}">${netSign}${net.toLocaleString()}</span>`;
        },
      },
      grid: { left: 10, right: 10, top: 10, bottom: 30, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 12, fontWeight: "bold" },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: {
          color: t.textColor,
          fontSize: 10,
          formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toLocaleString(),
        },
        splitLine: { lineStyle: { color: t.gridColor, type: "dashed" } },
      },
      series: [
        {
          name: "总多单",
          type: "bar",
          data: buyData,
          barWidth: "30%",
          barGap: "10%",
          itemStyle: { color: "#ef4444", borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top",
            formatter: (p: { value: number }) => p.value >= 10000 ? `${(p.value/10000).toFixed(1)}万` : p.value.toLocaleString(),
            color: t.textColor,
            fontSize: 9,
          },
        },
        {
          name: "总空单",
          type: "bar",
          data: sellData,
          barWidth: "30%",
          itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top",
            formatter: (p: { value: number }) => p.value >= 10000 ? `${(p.value/10000).toFixed(1)}万` : p.value.toLocaleString(),
            color: t.textColor,
            fontSize: 9,
          },
        },
      ],
    }, true);
  }, [data]);

  return <div ref={containerRef} style={{ height: 260 }} />;
}

/* ------------------------------------------------------------------ */
/*  Net change bar chart (per broker)                                  */
/* ------------------------------------------------------------------ */

function NetChangeChart({ brokers, dark }: { brokers: BrokerHolding[]; dark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || brokers.length === 0) return;

    const t = getChartTheme();
    const sorted = [...brokers].sort((a, b) => (b.buy_oi_change - b.sell_oi_change) - (a.buy_oi_change - a.sell_oi_change));
    const names = sorted.map(b => b.broker);
    const netChanges = sorted.map(b => b.buy_oi_change - b.sell_oi_change);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (params: { value: number; name: string }[]) => {
          if (!params?.length) return "";
          const v = params[0].value;
          const sign = v > 0 ? "+" : "";
          return `<b>${params[0].name}</b><br/>净变化: <span style="color:${v > 0 ? t.downColor : t.upColor}">${sign}${v.toLocaleString()}</span> 手`;
        },
      },
      grid: { left: 80, right: 20, top: 10, bottom: 10, containLabel: false },
      xAxis: {
        type: "value",
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 9 },
        splitLine: { lineStyle: { color: t.gridColor, type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 9 },
        axisTick: { show: false },
      },
      series: [{
        type: "bar",
        data: netChanges.map(v => ({
          value: v,
          itemStyle: { color: v >= 0 ? "#ef4444" : "#22c55e", borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] },
        })),
        barWidth: "60%",
        label: {
          show: true,
          position: (p: { value: number }) => p.value >= 0 ? "right" : "left",
          formatter: (p: { value: number }) => { const s = p.value > 0 ? "+" : ""; return `${s}${p.value.toLocaleString()}`; },
          color: t.textColor,
          fontSize: 9,
        },
      }],
    }, true);
  }, [brokers, dark]);

  if (brokers.length === 0) {
    return <div className="text-muted-foreground text-sm p-4 text-center">暂无变化数据</div>;
  }

  return <div ref={containerRef} style={{ height: Math.max(200, brokers.length * 24) }} />;
}

/* ------------------------------------------------------------------ */
/*  Summary cards                                                      */
/* ------------------------------------------------------------------ */

function SummaryCards({ summary }: { summary: { total_buy_oi: number; total_sell_oi: number; net_oi: number; total_buy_vol: number; total_sell_vol: number } }) {
  const net = summary.net_oi;
  const netUp = net > 0;
  const netDown = net < 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">总多单</p>
        <p className="text-lg font-bold tabular-nums mt-1 text-danger">{(summary.total_buy_oi / 10000).toFixed(1)}万</p>
        <p className="text-[10px] text-muted-foreground">{summary.total_buy_oi.toLocaleString()} 手</p>
      </div>
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">总空单</p>
        <p className="text-lg font-bold tabular-nums mt-1 text-success">{(summary.total_sell_oi / 10000).toFixed(1)}万</p>
        <p className="text-[10px] text-muted-foreground">{summary.total_sell_oi.toLocaleString()} 手</p>
      </div>
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">净持仓</p>
        <div className="flex items-center gap-1 mt-1">
          {netUp && <TrendingUp className="h-4 w-4 text-danger" />}
          {netDown && <TrendingDown className="h-4 w-4 text-success" />}
          {!netUp && !netDown && <Minus className="h-4 w-4 text-muted-foreground" />}
          <span className={cn("text-lg font-bold tabular-nums", netUp ? "text-danger" : netDown ? "text-success" : "text-muted-foreground")}>
            {net > 0 ? "+" : ""}{(net / 10000).toFixed(1)}万
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">{net.toLocaleString()} 手</p>
      </div>
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">总成交量</p>
        <p className="text-lg font-bold tabular-nums mt-1">{(summary.total_buy_vol / 10000).toFixed(1)}万</p>
        <p className="text-[10px] text-muted-foreground">{summary.total_buy_vol.toLocaleString()} 手</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Broker table                                                       */
/* ------------------------------------------------------------------ */

function BrokerTable({ brokers }: { brokers: BrokerHolding[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? brokers : brokers.slice(0, 10);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left px-2 py-1.5 font-medium">排名</th>
              <th className="text-left px-2 py-1.5 font-medium">席位</th>
              <th className="text-right px-2 py-1.5 font-medium text-danger">多单</th>
              <th className="text-right px-2 py-1.5 font-medium text-success">空单</th>
              <th className="text-right px-2 py-1.5 font-medium">净持仓</th>
              <th className="text-right px-2 py-1.5 font-medium">多单变化</th>
              <th className="text-right px-2 py-1.5 font-medium">空单变化</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((b) => {
              const net = b.net_oi;
              return (
                <tr key={b.rank} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-1.5 text-muted-foreground">{b.rank}</td>
                  <td className="px-2 py-1.5 font-medium">{b.broker}</td>
                  <td className="px-2 py-1.5 text-right text-danger tabular-nums">{b.buy_oi.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-success tabular-nums">{b.sell_oi.toLocaleString()}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", net > 0 ? "text-danger" : net < 0 ? "text-success" : "")}>
                    {net > 0 ? "+" : ""}{net.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {b.buy_oi_change > 0 ? "+" : ""}{b.buy_oi_change.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {b.sell_oi_change > 0 ? "+" : ""}{b.sell_oi_change.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {brokers.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/40"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "收起" : `展开全部 ${brokers.length} 家席位`}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contract panel (per contract code)                                 */
/* ------------------------------------------------------------------ */

function ContractPanel({ data }: { data: FuturesContractData }) {
  const { dark } = useDarkMode();
  const info = CONTRACT_INFO[data.contract.code] || { label: data.contract.code, desc: data.contract.name, color: "text-muted-foreground" };
  const netPct = data.summary.total_buy_oi + data.summary.total_sell_oi > 0
    ? ((data.summary.net_oi / (data.summary.total_buy_oi + data.summary.total_sell_oi)) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold", info.color)}>{info.label}</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{data.contract.code}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{info.desc} · {data.date}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-bold tabular-nums", data.summary.net_oi > 0 ? "text-danger" : data.summary.net_oi < 0 ? "text-success" : "text-muted-foreground")}>
            {data.summary.net_oi > 0 ? "净多" : data.summary.net_oi < 0 ? "净空" : "中性"}
          </p>
          <p className="text-[10px] text-muted-foreground">多空比 {netPct}%</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-4 py-3">
        <SummaryCards summary={data.summary} />
      </div>

      {/* Chart: broker holding distribution */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">前20席位多空持仓分布</h3>
        </div>
        <BrokerHoldingChart brokers={data.brokers} dark={dark} />
      </div>

      {/* Chart: broker net change */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <PieChart className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">席位净持仓变化（较前一交易日）</h3>
        </div>
        <NetChangeChart brokers={data.brokers} dark={dark} />
      </div>

      {/* Broker table */}
      <div className="px-4 pb-4">
        <BrokerTable brokers={data.brokers} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Futures page                                                       */
/* ------------------------------------------------------------------ */

export function Futures() {
  const [data, setData] = useState<Record<string, FuturesContractData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCode, setActiveCode] = useState<string>("IF");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.fetchFuturesHoldings();
      if (res.status === "ok") {
        setData(res.data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const contracts = ["IF", "IC", "IH", "IM"];

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            股指期货
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            中金所 · 前20席位多空持仓 · 每日15:30后更新
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* Contract tabs */}
      <div className="shrink-0 mt-4 flex gap-1">
        {contracts.map((code) => {
          const info = CONTRACT_INFO[code];
          const active = activeCode === code;
          return (
            <button
              key={code}
              onClick={() => setActiveCode(code)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <span className={info.color}>{info.label}</span>
              <span className="ml-1.5 text-[10px] text-muted-foreground">{code}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 mt-4 space-y-4 overflow-auto">
        {loading && !data ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="border rounded-xl bg-card p-5 animate-pulse space-y-3">
                <div className="h-5 bg-muted rounded w-32" />
                <div className="h-20 bg-muted rounded" />
                <div className="h-40 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            {/* All-contracts summary */}
            <div className="border rounded-xl bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">四大股指期货多空总对比</h2>
              </div>
              <NetOiSummaryChart data={data} />
            </div>

            {/* Active contract detail */}
            {data[activeCode] && <ContractPanel data={data[activeCode]} />}
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
            暂无数据，请稍后刷新
          </div>
        )}
      </div>
    </div>
  );
}
