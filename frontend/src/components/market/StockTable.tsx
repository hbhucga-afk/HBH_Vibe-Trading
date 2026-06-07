import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { StockData } from "@/lib/api";

type SortKey = "price" | "change_pct" | "pe_ttm" | "mcap_yi";
type SortDir = "asc" | "desc";

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function fmtChangePct(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPE(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function fmtMcap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万亿`;
  return `${v.toFixed(0)}亿`;
}

function sortVal(v: number | null): number {
  return v ?? -Infinity;
}

const TH = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={cn("text-xs font-medium text-muted-foreground py-2 px-3 text-right first:text-left", className)}>
    {children}
  </th>
);

const TD = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("py-2 px-3 text-right first:text-left text-sm tabular-nums", className)}>
    {children}
  </td>
);

function ChangeCell({ pct }: { pct: number | null }) {
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  const color = up ? "text-danger" : down ? "text-success" : "text-muted-foreground";
  return <TD className={color}>{fmtChangePct(pct)}</TD>;
}

interface SortableTHProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}

function SortableTH({ label, sortKey, currentKey, dir, onClick }: SortableTHProps) {
  const active = currentKey === sortKey;
  return (
    <TH className="cursor-pointer select-none hover:text-foreground transition-colors">
      <button
        type="button"
        className="inline-flex items-center gap-0.5"
        onClick={() => onClick(sortKey)}
      >
        <span className={active ? "text-foreground font-semibold" : ""}>{label}</span>
        <span className={cn("text-[10px] leading-none", active ? "text-foreground" : "text-muted-foreground/40")}>
          {active ? (dir === "desc" ? "▼" : "▲") : "▽"}
        </span>
      </button>
    </TH>
  );
}

interface StockTableProps {
  title: React.ReactNode;
  stocks: StockData[];
  onSelect?: (code: string) => void;
}

export function StockTable({ title, stocks, onSelect }: StockTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return stocks;
    return [...stocks].sort((a, b) => {
      const va = sortVal(a[sortKey]);
      const vb = sortVal(b[sortKey]);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [stocks, sortKey, sortDir]);

  return (
    <div className="border rounded-xl bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto flex-1 min-h-0">
        <div className="overflow-y-auto h-full">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted/50 backdrop-blur-sm">
                <TH>名称</TH>
                <SortableTH label="最新价" sortKey="price" currentKey={sortKey} dir={sortDir} onClick={handleSort} />
                <SortableTH label="涨跌幅" sortKey="change_pct" currentKey={sortKey} dir={sortDir} onClick={handleSort} />
                <SortableTH label="PE(TTM)" sortKey="pe_ttm" currentKey={sortKey} dir={sortDir} onClick={handleSort} />
                <SortableTH label="市值" sortKey="mcap_yi" currentKey={sortKey} dir={sortDir} onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr
                  key={s.code}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/20 transition-colors",
                    onSelect && "cursor-pointer"
                  )}
                  onClick={() => onSelect?.(s.code)}
                >
                  <TD className="font-medium">
                    <div className="flex flex-col">
                      <span>{s.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{s.code}</span>
                    </div>
                  </TD>
                  <TD className="font-medium">{fmtPrice(s.price)}</TD>
                  <ChangeCell pct={s.change_pct} />
                  <TD className="text-muted-foreground">{fmtPE(s.pe_ttm)}</TD>
                  <TD className="text-muted-foreground">{fmtMcap(s.mcap_yi)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
