import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  accent?: "emerald" | "cyan" | "indigo";
}

const ACCENTS = {
  emerald: "text-primary bg-primary/12",
  cyan: "text-accent-cyan bg-accent-cyan/10",
  indigo: "text-accent-indigo bg-accent-indigo/10",
};

export default function StatCard({ title, value, icon: Icon, hint, accent = "emerald" }: StatCardProps) {
  return (
    <div className="glass p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${ACCENTS[accent]}`}>
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{title}</p>
        <p className="text-2xl font-bold font-display leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-ink-variant mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}
