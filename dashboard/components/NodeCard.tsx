import { Cpu, MemoryStick, Radio } from "lucide-react";
import type { NodeStats } from "@/lib/types";

export default function NodeCard({ node }: { node: NodeStats }) {
  const ready = node.state === 1;
  return (
    <div className="glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm truncate">{node.name}</span>
        <span className={`w-2 h-2 rounded-full ${ready ? "bg-primary animate-pulse-soft" : "bg-danger"}`} title={ready ? "Ready" : "Down"} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] text-ink-muted uppercase tracking-tighter">
        <div className="flex items-center gap-1.5">
          <Cpu size={12} />
          <span>CPU <span className="text-ink font-medium normal-case">{node.cpu}%</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <MemoryStick size={12} />
          <span>MEM <span className="text-ink font-medium normal-case">{node.memory}MB</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Radio size={12} />
          <span>PLAYERS <span className="text-ink font-medium normal-case">{node.players}</span></span>
        </div>
        <div>
          <span className="text-slate-500">STATE </span>
          <span className={`font-semibold ${ready ? "text-primary" : "text-danger"}`}>{ready ? "READY" : "DOWN"}</span>
        </div>
      </div>
    </div>
  );
}
