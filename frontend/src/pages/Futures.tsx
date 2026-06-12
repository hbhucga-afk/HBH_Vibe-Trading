import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { cn } from "@/lib/utils";
import { api, type FuturesContractData, type BrokerHolding, type FuturesQuotesResponse, type CcpmResponse } from "@/lib/api";
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
/*  Real-time price quotes table (CFFEX 延时行情)                      */
/* ------------------------------------------------------------------ */

function PriceQuotesTable({ quotes }: { quotes: FuturesQuotesResponse }) {
  const contracts = Array.isArray(quotes.contracts) ? quotes.contracts : [];

  const COLLAPSED_INFO: Record<string, { label: string; color: string }> = {
    IF: { label: "IF", color: "text-blue-500" },
    IC: { label: "IC", color: "text-emerald-500" },
    IM: { label: "IM", color: "text-orange-500" },
    IH: { label: "IH", color: "text-purple-500" },
  };

  // Group contracts by 品种
  const grouped: Record<string, typeof contracts> = {};
  for (const c of contracts) {
    const p = c["品种"];
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(c);
  }

  const productCodes = quotes.summary?.["品种"] || Object.keys(grouped);

  if (contracts.length === 0) {
    return (
      <div className="border rounded-xl bg-card p-4 text-center text-muted-foreground text-sm">
        暂无实时行情数据
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">实时行情</h3>
          <p className="text-[11px] text-muted-foreground">
            {quotes.source} · {quotes.date}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th className="text-left px-2 py-1.5 font-medium">品种</th>
              <th className="text-left px-2 py-1.5 font-medium">合约</th>
              <th className="text-right px-2 py-1.5 font-medium">开盘</th>
              <th className="text-right px-2 py-1.5 font-medium">最高</th>
              <th className="text-right px-2 py-1.5 font-medium">最低</th>
              <th className="text-right px-2 py-1.5 font-medium">最新</th>
              <th className="text-right px-2 py-1.5 font-medium">涨跌</th>
              <th className="text-right px-2 py-1.5 font-medium">成交量</th>
              <th className="text-right px-2 py-1.5 font-medium">持仓量</th>
            </tr>
          </thead>
          <tbody>
            {productCodes.map((product) => {
              const rows = grouped[product] || [];
              return rows.map((c, idx) => {
                const isFirst = idx === 0;
                const change = c["涨跌"];
                const up = change > 0;
                const down = change < 0;
                const info = COLLAPSED_INFO[product];

                return (
                  <tr
                    key={c["合约名称"]}
                    className={cn(
                      "border-b border-border/30 hover:bg-muted/20 transition-colors",
                      isFirst && "border-t-2 border-t-border",
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <span className={cn("font-bold", info?.color)}>{product}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{c["合约名称"]}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c["开盘价"].toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c["最高价"].toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c["最低价"].toFixed(2)}
                    </td>
                    <td className={cn(
                      "px-2 py-1.5 text-right tabular-nums font-bold",
                      up && "text-danger",
                      down && "text-success",
                    )}>
                      {c["最新价"].toFixed(2)}
                    </td>
                    <td className={cn(
                      "px-2 py-1.5 text-right tabular-nums font-medium",
                      up && "text-danger",
                      down && "text-success",
                    )}>
                      {up ? "+" : ""}{change.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c["成交量"].toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c["持仓量"].toLocaleString()}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
        涨跌 = 最新价 - 前结算价 · 数据来源：{quotes.sourceUrl}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  CCFPM Member Rankings Panel (成交持仓排名)                          */
/* ------------------------------------------------------------------ */

const CONTRACT_COLORS: Record<string, string> = {
  IF2606: "border-l-blue-500", IF2607: "border-l-blue-400", IF2609: "border-l-blue-600", IF2612: "border-l-blue-300",
  IC2606: "border-l-emerald-500", IC2607: "border-l-emerald-400", IC2609: "border-l-emerald-600", IC2612: "border-l-emerald-300",
  IM2606: "border-l-orange-500", IM2607: "border-l-orange-400", IM2609: "border-l-orange-600", IM2612: "border-l-orange-300",
  IH2606: "border-l-purple-500", IH2607: "border-l-purple-400", IH2609: "border-l-purple-600", IH2612: "border-l-purple-300",
};

function CcpmContractTable({ contract }: { contract: { instrumentId: string; summary: { totalVolume: number; totalBuyPosition: number; totalSellPosition: number; netPosition: number }; volumeRankings: { rank: number; shortName: string; volume: number; varVolume: number }[]; buyPositionRankings: { rank: number; shortName: string; volume: number; varVolume: number }[]; sellPositionRankings: { rank: number; shortName: string; volume: number; varVolume: number }[] } }) {
  const maxRows = Math.max(contract.volumeRankings.length, contract.buyPositionRankings.length, contract.sellPositionRankings.length);
  const rows = Array.from({ length: maxRows }, (_, i) => ({
    vol: contract.volumeRankings[i] || null,
    buy: contract.buyPositionRankings[i] || null,
    sell: contract.sellPositionRankings[i] || null,
  }));

  const borderColor = CONTRACT_COLORS[contract.instrumentId] || "border-l-muted";
  const s = contract.summary;
  const netSign = s.netPosition > 0 ? "+" : "";

  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden border-l-4", borderColor)}>
      <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between">
        <span className="text-sm font-bold tabular-nums">{contract.instrumentId}</span>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span>成交量: {s.totalVolume.toLocaleString()}</span>
          <span>多: {s.totalBuyPosition.toLocaleString()}</span>
          <span>空: {s.totalSellPosition.toLocaleString()}</span>
          <span className={cn("font-medium", s.netPosition > 0 ? "text-danger" : s.netPosition < 0 ? "text-success" : "")}>
            净: {netSign}{s.netPosition.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-muted/20 text-muted-foreground">
              <th className="w-8 px-1 py-1 text-center">#</th>
              <th className="text-left px-1 py-1">会员简称</th>
              <th className="text-right px-1 py-1">成交量</th>
              <th className="text-right px-1 py-1">变化</th>
              <th className="w-8 px-1 py-1 text-center">#</th>
              <th className="text-left px-1 py-1">会员简称</th>
              <th className="text-right px-1 py-1">持买单</th>
              <th className="text-right px-1 py-1">变化</th>
              <th className="w-8 px-1 py-1 text-center">#</th>
              <th className="text-left px-1 py-1">会员简称</th>
              <th className="text-right px-1 py-1">持卖单</th>
              <th className="text-right px-1 py-1">变化</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                <td className="px-1 py-0.5 text-center text-muted-foreground">{row.vol?.rank ?? ""}</td>
                <td className="px-1 py-0.5 font-medium">{row.vol?.shortName ?? ""}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{row.vol?.volume?.toLocaleString() ?? ""}</td>
                <td className={cn("px-1 py-0.5 text-right tabular-nums", (row.vol?.varVolume ?? 0) > 0 ? "text-danger" : (row.vol?.varVolume ?? 0) < 0 ? "text-success" : "text-muted-foreground")}>
                  {(row.vol?.varVolume ?? 0) > 0 ? "+" : ""}{row.vol?.varVolume?.toLocaleString() ?? ""}
                </td>
                <td className="px-1 py-0.5 text-center text-muted-foreground">{row.buy?.rank ?? ""}</td>
                <td className="px-1 py-0.5 font-medium">{row.buy?.shortName ?? ""}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{row.buy?.volume?.toLocaleString() ?? ""}</td>
                <td className={cn("px-1 py-0.5 text-right tabular-nums", (row.buy?.varVolume ?? 0) > 0 ? "text-danger" : (row.buy?.varVolume ?? 0) < 0 ? "text-success" : "text-muted-foreground")}>
                  {(row.buy?.varVolume ?? 0) > 0 ? "+" : ""}{row.buy?.varVolume?.toLocaleString() ?? ""}
                </td>
                <td className="px-1 py-0.5 text-center text-muted-foreground">{row.sell?.rank ?? ""}</td>
                <td className="px-1 py-0.5 font-medium">{row.sell?.shortName ?? ""}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{row.sell?.volume?.toLocaleString() ?? ""}</td>
                <td className={cn("px-1 py-0.5 text-right tabular-nums", (row.sell?.varVolume ?? 0) > 0 ? "text-danger" : (row.sell?.varVolume ?? 0) < 0 ? "text-success" : "text-muted-foreground")}>
                  {(row.sell?.varVolume ?? 0) > 0 ? "+" : ""}{row.sell?.varVolume?.toLocaleString() ?? ""}
                </td>
              </tr>
            ))}
            {/* 合计行 */}
            {(() => {
              const r20 = rows.slice(0, 20);
              const tv = r20.reduce((s, r) => s + (r.vol?.volume ?? 0), 0);
              const tvc = r20.reduce((s, r) => s + (r.vol?.varVolume ?? 0), 0);
              const tb = r20.reduce((s, r) => s + (r.buy?.volume ?? 0), 0);
              const tbc = r20.reduce((s, r) => s + (r.buy?.varVolume ?? 0), 0);
              const ts = r20.reduce((s, r) => s + (r.sell?.volume ?? 0), 0);
              const tsc = r20.reduce((s, r) => s + (r.sell?.varVolume ?? 0), 0);
              return (
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-1 py-1 text-center" colSpan={2}>合计</td>
                  <td className="px-1 py-1 text-right tabular-nums">{tv.toLocaleString()}</td>
                  <td className={cn("px-1 py-1 text-right tabular-nums", tvc > 0 ? "text-danger" : tvc < 0 ? "text-success" : "")}>
                    {tvc > 0 ? "+" : ""}{tvc.toLocaleString()}
                  </td>
                  <td className="px-1 py-1 text-center" colSpan={2}>合计</td>
                  <td className="px-1 py-1 text-right tabular-nums">{tb.toLocaleString()}</td>
                  <td className={cn("px-1 py-1 text-right tabular-nums", tbc > 0 ? "text-danger" : tbc < 0 ? "text-success" : "")}>
                    {tbc > 0 ? "+" : ""}{tbc.toLocaleString()}
                  </td>
                  <td className="px-1 py-1 text-center" colSpan={2}>合计</td>
                  <td className="px-1 py-1 text-right tabular-nums">{ts.toLocaleString()}</td>
                  <td className={cn("px-1 py-1 text-right tabular-nums", tsc > 0 ? "text-danger" : tsc < 0 ? "text-success" : "")}>
                    {tsc > 0 ? "+" : ""}{tsc.toLocaleString()}
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CcpmPanel({ ccpm, activeCode }: { ccpm: CcpmResponse; activeCode: string }) {
  const product = ccpm.data[activeCode];
  if (!product || !product.contracts) {
    return (
      <div className="border rounded-xl bg-card p-4 text-center text-muted-foreground text-sm">
        暂无 {activeCode} 成交持仓排名数据
      </div>
    );
  }

  const contractIds = Object.keys(product.contracts).sort();

  // Use IM2606 (front-month) institutions as the base list
  const mainContract = product.contracts[contractIds[0]];
  const instList = (mainContract?.buyPositionRankings || []).map(r => {
    const name = r.shortName;
    let buy = 0, sell = 0;
    const byContract: Record<string, { buy: number; sell: number }> = {};
    for (const cid of contractIds) {
      const c = product.contracts[cid];
      const b = c.buyPositionRankings.find(x => x.shortName === name);
      const s = c.sellPositionRankings.find(x => x.shortName === name);
      byContract[cid] = { buy: b?.volume ?? 0, sell: s?.volume ?? 0 };
      buy += b?.volume ?? 0;
      sell += s?.volume ?? 0;
    }
    return { name, buy, sell, byContract };
  });
  const instTop20 = instList.slice(0, 20);
  const instTotal = {
    buy: contractIds.reduce((s, cid) => s + product.contracts[cid].summary.totalBuyPosition, 0),
    sell: contractIds.reduce((s, cid) => s + product.contracts[cid].summary.totalSellPosition, 0),
  };
  const netTotal = instTotal.buy - instTotal.sell;

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">成交持仓排名 · {product.productName}</h3>
          <p className="text-[11px] text-muted-foreground">
            {product.source} · {product.date} · 前20名
          </p>
        </div>
      </div>
      <div className="p-3 space-y-3">
        {/* 四大合约跨期汇总 */}
        <div className="border rounded-lg bg-card overflow-hidden border-l-4 border-l-primary">
          <div className="px-3 py-2 border-b bg-muted/20">
            <span className="text-sm font-bold">机构净持仓汇总（分合约）</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="text-left px-1 py-1">机构</th>
                  {contractIds.map(cid => (
                    <th key={cid} className="text-right px-1 py-1" colSpan={3}>{cid}</th>
                  ))}
                  <th className="text-right px-1 py-1" colSpan={3}>合计</th>
                </tr>
                <tr className="border-b bg-muted/20 text-muted-foreground text-[10px]">
                  <th></th><th></th>
                  {contractIds.map(cid => (
                    <Fragment key={cid}>
                      <th className="text-right px-1 py-0.5 text-danger/70">多</th>
                      <th className="text-right px-1 py-0.5 text-success/70">空</th>
                      <th className="text-right px-1 py-0.5">净</th>
                    </Fragment>
                  ))}
                  <th className="text-right px-1 py-0.5 text-danger/70">多</th>
                  <th className="text-right px-1 py-0.5 text-success/70">空</th>
                  <th className="text-right px-1 py-0.5">净</th>
                </tr>
              </thead>
              <tbody>
                {instTop20.map((r, i) => {
                  const net = r.buy - r.sell;
                  return (
                    <tr key={r.name} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="px-1 py-0.5 text-center text-muted-foreground">{i + 1}</td>
                      <td className="px-1 py-0.5 font-medium whitespace-nowrap">{r.name}</td>
                      {contractIds.map(cid => {
                        const bc = r.byContract[cid];
                        const netC = bc.buy - bc.sell;
                        return (
                          <Fragment key={cid}>
                            <td className="px-1 py-0.5 text-right tabular-nums text-danger/80">{bc.buy > 0 ? bc.buy.toLocaleString() : "-"}</td>
                            <td className="px-1 py-0.5 text-right tabular-nums text-success/80">{bc.sell > 0 ? bc.sell.toLocaleString() : "-"}</td>
                            <td className={cn("px-1 py-0.5 text-right tabular-nums", netC > 0 ? "text-danger" : netC < 0 ? "text-success" : "text-muted-foreground")}>
                              {netC > 0 ? "+" : ""}{netC.toLocaleString()}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-1 py-0.5 text-right tabular-nums font-medium text-danger">{r.buy.toLocaleString()}</td>
                      <td className="px-1 py-0.5 text-right tabular-nums font-medium text-success">{r.sell.toLocaleString()}</td>
                      <td className={cn("px-1 py-0.5 text-right tabular-nums font-bold", net > 0 ? "text-danger" : net < 0 ? "text-success" : "")}>
                        {net > 0 ? "+" : ""}{net.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-1 py-1 text-center" colSpan={2}>合计</td>
                  {contractIds.map(cid => {
                    const c = product.contracts[cid];
                    const tb = c.summary.totalBuyPosition;
                    const ts = c.summary.totalSellPosition;
                    const tn = c.summary.netPosition;
                    return (
                      <Fragment key={cid}>
                        <td className="px-1 py-1 text-right tabular-nums text-danger">{tb.toLocaleString()}</td>
                        <td className="px-1 py-1 text-right tabular-nums text-success">{ts.toLocaleString()}</td>
                        <td className={cn("px-1 py-1 text-right tabular-nums", tn > 0 ? "text-danger" : tn < 0 ? "text-success" : "")}>
                          {tn > 0 ? "+" : ""}{tn.toLocaleString()}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="px-1 py-1 text-right tabular-nums text-danger">{instTotal.buy.toLocaleString()}</td>
                  <td className="px-1 py-1 text-right tabular-nums text-success">{instTotal.sell.toLocaleString()}</td>
                  <td className={cn("px-1 py-1 text-right tabular-nums", netTotal > 0 ? "text-danger" : netTotal < 0 ? "text-success" : "")}>
                    {netTotal > 0 ? "+" : ""}{netTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 各合约明细 */}
        {contractIds.map(id => (
          <CcpmContractTable key={id} contract={product.contracts[id]} />
        ))}
      </div>
      <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
        成交量、持仓量：手（按单边计算） · 数据来源：{product.sourceUrl}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Futures page                                                       */
/* ------------------------------------------------------------------ */

export function Futures() {
  const [data, setData] = useState<Record<string, FuturesContractData> | null>(null);
  const [quotes, setQuotes] = useState<FuturesQuotesResponse | null>(null);
  const [ccpm, setCcpm] = useState<CcpmResponse | null>(null);
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
    try {
      const q = await api.fetchFuturesQuotes();
      if (q.status === "ok") {
        setQuotes(q);
      }
    } catch { /* ignore */ }
    try {
      const c = await api.fetchFuturesCcpm();
      if (c.status === "ok") {
        setCcpm(c);
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
            {/* Real-time price quotes table */}
            {quotes && <PriceQuotesTable quotes={quotes} />}

            {/* CCFPM member position rankings */}
            {ccpm && <CcpmPanel ccpm={ccpm} activeCode={activeCode} />}

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
