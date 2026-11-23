"use client";

import { Cpu, Loader2, MemoryStick, Network, Radio } from "lucide-react";
import { useLiveStats } from "@/lib/useLive";

export default function NetworkPage() {
  const { stats } = useLiveStats();

  if (!stats) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const ready = stats.nodes.filter((n) => n.state === 1).length;
  const totalPlayers = stats.nodes.reduce((acc, n) => acc + n.players, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Network</h1>
        <p className="text-sm text-ink-muted mt-1">Lavalink node health</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/12 text-primary"><Network size={20} /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">Nodes</p><p className="text-2xl font-bold font-display">{stats.nodes.length}</p></div>
        </div>
        <div className="glass p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-accent-cyan/10 text-accent-cyan"><Radio size={20} /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">Ready</p><p className="text-2xl font-bold font-display text-primary">{ready}</p></div>
        </div>
        <div className="glass p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-accent-indigo/10 text-accent-indigo"><Cpu size={20} /></div>
          <div><p className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">Active players</p><p className="text-2xl font-bold font-display">{totalPlayers}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {stats.nodes.map((node) => {
          const ok = node.state === 1;
          return (
            <div key={node.name} className={`glass p-6 space-y-4 ${ok ? "border-primary/25" : "border-danger/30"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{node.name}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-primary animate-pulse-soft" : "bg-danger"}`} />
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-black/20 rounded-2xl py-3 border border-white/[0.08]">
                  <Cpu size={15} className="mx-auto text-ink-variant mb-1" />
                  <p className="text-sm font-semibold">{node.cpu}%</p>
                  <p className="text-[9px] uppercase tracking-widest text-ink-muted">CPU</p>
                </div>
                <div className="bg-black/20 rounded-2xl py-3 border border-white/[0.08]">
                  <MemoryStick size={15} className="mx-auto text-ink-variant mb-1" />
                  <p className="text-sm font-semibold">{node.memory}MB</p>
                  <p className="text-[9px] uppercase tracking-widest text-ink-muted">Mem</p>
                </div>
                <div className="bg-black/20 rounded-2xl py-3 border border-white/[0.08]">
                  <Radio size={15} className="mx-auto text-ink-variant mb-1" />
                  <p className="text-sm font-semibold">{node.players}</p>
                  <p className="text-[9px] uppercase tracking-widest text-ink-muted">Players</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2">
                <span className={`chip ${ok ? "bg-primary/10 border-primary/25 text-primary" : "bg-danger/10 border-danger/30 text-danger"}`}>
                  {ok ? "Ready" : "Down"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
