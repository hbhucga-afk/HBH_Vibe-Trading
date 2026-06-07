import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type IndexData, type StockData } from "@/lib/api";
import { IndexCard } from "@/components/market/IndexCard";
import { StockTable } from "@/components/market/StockTable";
import { StockDetailModal } from "@/components/market/StockDetailModal";

export function Home() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [robotStocks, setRobotStocks] = useState<StockData[]>([]);
  const [aiStocks, setAiStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const allStocks = [...robotStocks, ...aiStocks];
  const selectedStock = selectedCode
    ? allStocks.find((s) => s.code === selectedCode) ?? null
    : null;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [indicesRes, robotRes, aiRes] = await Promise.all([
        api.fetchMarketIndices(),
        api.fetchMarketStocks("robot"),
        api.fetchMarketStocks("ai-compute"),
      ]);
      setIndices(indicesRes.indices ?? []);
      setRobotStocks(robotRes.stocks ?? []);
      setAiStocks(aiRes.stocks ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取数据失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchRef.current(true), 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />市场总览
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A股/美股大盘 · 人形机器人 &amp; AI算力 核心标的 · 实时行情（腾讯，30s自动刷新）
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {error && (
        <div className="shrink-0 mt-4 border border-danger/30 bg-danger/5 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Indices row — horizontally scrollable */}
      <div className="shrink-0 mt-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">大盘指数</h2>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-3 min-w-max">
            {indices.map((idx) => (
              <IndexCard key={idx.code} data={idx} />
            ))}
            {loading && indices.length === 0 &&
              Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border rounded-xl p-4 bg-card min-w-[140px] animate-pulse space-y-2">
                  <div className="h-3 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-24" />
                  <div className="h-4 bg-muted rounded w-20" />
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Two-column stock tables — flex-1 fills remaining viewport space */}
      <div className="flex-1 min-h-0 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading && robotStocks.length === 0 ? (
          <>
            <div className="border rounded-xl bg-card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-48 bg-muted rounded" />
            </div>
            <div className="border rounded-xl bg-card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-48 bg-muted rounded" />
            </div>
          </>
        ) : (
          <>
            <StockTable title={<>人形机器人 <span className="text-[32px] font-bold mx-0.5 leading-none align-middle">·</span> 核心标的</>} stocks={robotStocks} onSelect={setSelectedCode} />
            <StockTable title={<>AI算力 <span className="text-[32px] font-bold mx-0.5 leading-none align-middle">·</span> 核心标的</>} stocks={aiStocks} onSelect={setSelectedCode} />
          </>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="shrink-0 text-right text-xs text-muted-foreground/60 select-none pt-3 pb-1">
        {lastUpdated ? (
          <span>更新于 {lastUpdated.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · </span>
        ) : null}
        数据来源：腾讯行情
      </div>

      {/* Stock detail modal */}
      {selectedStock && (
        <StockDetailModal
          stock={{
            code: selectedStock.code,
            name: selectedStock.name,
            price: selectedStock.price,
            change_pct: selectedStock.change_pct,
          }}
          onClose={() => setSelectedCode(null)}
        />
      )}
    </div>
  );
}
