"use client";

import { useMemo } from "react";
import { Headphones, Radio, Users } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import LiveActivityCard from "@/components/LiveActivityCard";
import NodeCard from "@/components/NodeCard";
import { useLiveStats } from "@/lib/useLive";
import { api } from "@/lib/client";

export default function OverviewPage() {
  const { stats, connected } = useLiveStats();

  const guildIds = useMemo(() => new Set((stats?.activeGuilds || []).map((g) => g.id)), [stats]);
  const listenerGuilds = useMemo(() => new Set((stats?.activeListeners || []).map((l) => l.guildName)), [stats]);

  const handleAction = async (guildId: string, action: "pause" | "resume" | "skip" | "stop") => {
    try {
      const socket = (await import("socket.io-client")).io();
      socket.emit("player:action", { guildId, action });
      setTimeout(() => socket.disconnect(), 3000);
    } catch {}
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar guilds={stats.allGuilds} activeGuildIds={guildIds} listenerGuildNames={listenerGuilds} />

      <main className="flex-1 overflow-y-auto scrollbar-thin p-6 lg:p-8 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>
            <p className="text-sm text-ink-muted mt-0.5">
              {stats.totalGuilds} servers · {stats.totalMembers.toLocaleString()} members
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-primary" : "bg-warn"} animate-pulse-soft`} />
            <span className="text-xs text-ink-variant">{connected ? "Live" : "Reconnecting…"}</span>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatCard title="Total Guilds" value={stats.totalGuilds.toLocaleString()} icon={Radio} hint={`${stats.totalMembers.toLocaleString()} members`} />
          <StatCard title="Active Players" value={stats.activePlayers} icon={Headphones} hint={`${stats.nodes.filter((n) => n.state === 1).length} nodes ready`} accent="cyan" />
          <StatCard title="Live Listeners" value={stats.activeListeners.length} icon={Users} hint="members in voice" accent="indigo" />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Live Activity</h2>
            <span className="chip bg-primary/10 border border-primary/25 text-primary">Realtime</span>
          </div>

          {stats.activeGuilds.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {stats.activeGuilds.map((guild) => (
                <LiveActivityCard key={guild.id} guild={guild} onAction={handleAction} />
              ))}
            </div>
          ) : (
            <div className="glass p-12 rounded-2xl flex flex-col items-center justify-center text-center border border-dashed border-white/[0.08]">
              <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
                <Headphones size={24} className="text-ink-muted" />
              </div>
              <p className="text-sm font-medium">No active sessions</p>
              <p className="text-xs text-ink-muted mt-1">When music plays in a server it will appear here.</p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Node Monitor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {stats.nodes.map((node) => (
              <NodeCard key={node.name} node={node} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
