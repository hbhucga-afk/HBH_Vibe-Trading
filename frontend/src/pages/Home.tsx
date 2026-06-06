import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type IndexData, type StockData } from "@/lib/api";
import { IndexCard } from "@/components/market/IndexCard";
import { StockTable } from "@/components/market/StockTable";

export function Home() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [robotStocks, setRobotStocks] = useState<StockData[]>([]);
  const [aiStocks, setAiStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">市场总览</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {error && (
        <div className="border border-danger/30 bg-danger/5 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Indices row */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">大盘指数</h2>
        <div className="flex flex-wrap gap-3">
          {indices.map((idx) => (
            <IndexCard key={idx.code} data={idx} />
          ))}
          {loading && indices.length === 0 &&
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border rounded-xl p-4 bg-card min-w-[140px] animate-pulse space-y-2">
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-6 bg-muted rounded w-24" />
                <div className="h-4 bg-muted rounded w-20" />
              </div>
            ))
          }
        </div>
      </div>

      {/* Two-column stock tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <StockTable title="人形机器人核心标的" stocks={robotStocks} />
            <StockTable title="AI算力核心标的" stocks={aiStocks} />
          </>
        )}
      </div>
    </div>
  );
}
