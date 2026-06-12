import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type FundFlowRow } from "@/lib/api";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function SectorFundFlow() {
  const [rows, setRows] = useState<FundFlowRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateInput(new Date()));
  const [actualDate, setActualDate] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(
    async (date: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.fetchFundFlow(date);
        setRows(data.rows ?? []);
        setActualDate(data.actualDate || data.requestedDate || "");
        setUpdatedAt(data.updatedAt || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "获取数据失败");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    fetchData(selectedDate);
    const timer = setInterval(() => fetchRef.current(selectedDate, true), 60_000);
    return () => clearInterval(timer);
  }, [selectedDate]);

  const inflow = rows.filter((r) => r.value >= 0);
  const outflow = rows.filter((r) => r.value < 0);
  const maxInflow = inflow.length > 0 ? inflow.reduce((a, b) => (a.value > b.value ? a : b)) : null;
  const maxOutflow = outflow.length > 0 ? outflow.reduce((a, b) => (a.value < b.value ? a : b)) : null;

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Banknote className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">板块资金流向</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            min="2020-01-01"
            max="2035-12-31"
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-md border bg-background text-sm"
          />
          <button
            type="button"
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted text-sm"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Stats row */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">资金流入板块</div>
            <div className="mt-1 text-2xl font-bold text-success flex items-center gap-1">
              <TrendingUp className="w-5 h-5" />
              {inflow.length}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">资金流出板块</div>
            <div className="mt-1 text-2xl font-bold text-danger flex items-center gap-1">
              <TrendingDown className="w-5 h-5" />
              {outflow.length}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">最大净流入</div>
            <div className="mt-1 text-lg font-bold text-success truncate">
              {maxInflow ? `${maxInflow.name} +${maxInflow.value}亿` : "—"}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">最大净流出</div>
            <div className="mt-1 text-lg font-bold text-danger truncate">
              {maxOutflow ? `${maxOutflow.name} ${maxOutflow.value}亿` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Chart iframe */}
      <div className="flex-1 rounded-xl border bg-card overflow-hidden min-h-0">
        <iframe
          src={`/api/fund-flow/view?date=${selectedDate}`}
          title="板块资金流向图表"
          className="w-full h-full border-0"
        />
      </div>


      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>数据来源：东方财富行业板块资金流向</span>
        <span>
          {actualDate && `日期：${actualDate}`}
          {updatedAt && ` · 更新：${updatedAt}`}
        </span>
      </div>
    </div>
  );
}
