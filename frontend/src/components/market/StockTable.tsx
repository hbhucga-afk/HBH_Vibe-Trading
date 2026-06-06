import { cn } from "@/lib/utils";
import type { StockData } from "@/lib/api";

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

interface StockTableProps {
  title: string;
  stocks: StockData[];
}

export function StockTable({ title, stocks }: StockTableProps) {
  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <TH>名称</TH>
              <TH>最新价</TH>
              <TH>涨跌幅</TH>
              <TH>PE(TTM)</TH>
              <TH>市值</TH>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
              <tr key={s.code} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
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
  );
}
