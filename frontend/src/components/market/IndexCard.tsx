import { cn } from "@/lib/utils";
import type { IndexData } from "@/lib/api";

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return v >= 10 ? v.toFixed(2) : v.toFixed(4);
}

function fmtChangePct(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtChangeAmt(v: number | null): string {
  if (v == null) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

interface IndexCardProps {
  data: IndexData;
}

export function IndexCard({ data }: IndexCardProps) {
  const up = data.change_pct != null && data.change_pct > 0;
  const down = data.change_pct != null && data.change_pct < 0;
  const colorClass = up ? "text-danger" : down ? "text-success" : "text-muted-foreground";

  return (
    <div className="border rounded-xl p-4 bg-card flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">{data.label}</span>
        <span className="text-[10px] text-muted-foreground/50 px-1 py-0.5 rounded bg-muted">{data.market}</span>
      </div>
      <span className="text-xl font-bold tabular-nums">{fmtPrice(data.price)}</span>
      <div className={cn("text-sm font-medium tabular-nums flex items-center gap-1.5", colorClass)}>
        <span>{fmtChangeAmt(data.change_amt)}</span>
        <span>{fmtChangePct(data.change_pct)}</span>
      </div>
    </div>
  );
}
