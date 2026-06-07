import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type PriceBar, type QuoteData } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/CandlestickChart";

interface StockInfo {
  code: string;
  name: string;
  price: number | null;
  change_pct: number | null;
}

interface Props {
  stock: StockInfo;
  onClose: () => void;
}

function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return `${v.toFixed(0)}`;
}

function LadderRow({
  label,
  price,
  vol,
  side,
}: {
  label: string;
  price: number | null;
  vol: number | null;
  side: "bid" | "ask";
}) {
  const bg = side === "ask" ? "bg-danger/5" : "bg-success/5";
  const textColor = side === "ask" ? "text-danger" : "text-success";
  return (
    <div className={cn("flex items-center justify-between px-3 py-1.5 text-xs", bg)}>
      <span className="text-muted-foreground w-8">{label}</span>
      <span className={cn("font-medium tabular-nums", textColor)}>
        {price?.toFixed(2) ?? "—"}
      </span>
      <span className="text-muted-foreground/70 tabular-nums w-16 text-right">
        {fmtVol(vol)}
      </span>
    </div>
  );
}

export function StockDetailModal({ stock, onClose }: Props) {
  const [klines, setKlines] = useState<PriceBar[]>([]);
  const [quotes, setQuotes] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.fetchStockKlines(stock.code),
      api.fetchStockQuotes(stock.code),
    ])
      .then(([kRes, qRes]) => {
        setKlines(kRes.bars ?? []);
        setQuotes(qRes.quotes ?? null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "数据加载失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [stock.code]);

  const up = stock.change_pct != null && stock.change_pct > 0;
  const down = stock.change_pct != null && stock.change_pct < 0;
  const priceColor = up ? "text-danger" : down ? "text-success" : "";

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border rounded-2xl shadow-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{stock.name}</h2>
            <span className="text-sm text-muted-foreground font-mono">{stock.code}</span>
            <span className={cn("text-lg font-bold tabular-nums", priceColor)}>
              {stock.price?.toFixed(2) ?? "—"}
            </span>
            <span className={cn("text-sm font-medium tabular-nums", priceColor)}>
              {stock.change_pct != null
                ? `${stock.change_pct > 0 ? "+" : ""}${stock.change_pct.toFixed(2)}%`
                : "—"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex gap-0">
          {/* Error state */}
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p className="text-danger">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              {/* K-line chart */}
              <div className="flex-1 min-w-0 p-4 overflow-auto">
                {loading ? (
                  <div className="h-[400px] bg-muted/30 rounded-xl animate-pulse" />
                ) : klines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-muted-foreground text-sm">
                    <span>K线数据暂不可用</span>
                    <button
                      onClick={loadData}
                      className="px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm font-medium"
                    >
                      重试
                    </button>
                  </div>
                ) : (
                  <CandlestickChart data={klines} height={Math.max(380, window.innerHeight * 0.55)} />
                )}
              </div>

              {/* Level-2 quotes panel */}
              <div className="w-56 shrink-0 border-l flex flex-col bg-muted/10">
                <div className="px-4 py-3 border-b bg-muted/20">
                  <h3 className="text-xs font-semibold text-muted-foreground">五档盘口</h3>
                  {quotes?.servertime && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{quotes.servertime}</p>
                  )}
                </div>
                {loading ? (
                  <div className="flex-1 space-y-1 p-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="h-7 bg-muted/30 rounded animate-pulse" />
                    ))}
                  </div>
                ) : !quotes ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                    <span>盘口数据暂不可用</span>
                    <button
                      onClick={loadData}
                      className="px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors text-xs font-medium"
                    >
                      重试
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    {/* Asks (reverse: ask5 → ask1) */}
                    {(["ask5", "ask4", "ask3", "ask2", "ask1"] as const).map((key, i) => (
                      <LadderRow
                        key={key}
                        label={`卖${5 - i}`}
                        price={quotes[key]}
                        vol={quotes[`${key.slice(0, 3)}_vol${5 - i}` as keyof QuoteData] as number | null}
                        side="ask"
                      />
                    ))}
                    {/* Price divider */}
                    <div className="flex items-center justify-between px-3 py-2 border-y bg-muted/20">
                      <span className="text-xs text-muted-foreground">最新</span>
                      <span className={cn("text-sm font-bold tabular-nums", priceColor)}>
                        {quotes.price?.toFixed(2) ?? "—"}
                      </span>
                      <span className="w-16" />
                    </div>
                    {/* Bids (bid1 → bid5) */}
                    {(["bid1", "bid2", "bid3", "bid4", "bid5"] as const).map((key, i) => (
                      <LadderRow
                        key={key}
                        label={`买${i + 1}`}
                        price={quotes[key]}
                        vol={quotes[`${key.slice(0, 3)}_vol${i + 1}` as keyof QuoteData] as number | null}
                        side="bid"
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
