"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Headphones, Loader2, Play, Server, Users } from "lucide-react";
import { useLiveStats } from "@/lib/useLive";
import { api } from "@/lib/client";

export default function ServersPage() {
  const { stats } = useLiveStats();
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);

  const listenerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of stats?.activeListeners || []) map.set(l.guildName, (map.get(l.guildName) || 0) + 1);
    return map;
  }, [stats]);

  const activeByName = useMemo(() => {
    const map = new Map<string, { title: string; duration: string }>();
    for (const g of stats?.activeGuilds || []) map.set(g.name, { title: g.nowPlaying.title, duration: g.nowPlaying.duration });
    return map;
  }, [stats]);

  const openPlayer = async (guildId: string, join: boolean) => {
    setJoining(guildId);
    try {
      if (join) await api.join(guildId);
      router.push(`/listen?guild=${guildId}`);
    } catch (e) {
      alert(`Could not join voice channel: ${(e as Error).message}`);
    } finally {
      setJoining(null);
    }
  };

  if (!stats) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Servers</h1>
        <p className="text-sm text-ink-muted mt-1">Every server DJ Tester can reach</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {stats.allGuilds.map((guild) => {
          const listeners = listenerCounts.get(guild.name) || 0;
          const playing = activeByName.get(guild.name);
          const hot = guild.isActive || listeners > 0;
          return (
            <div key={guild.id} className={`glass p-6 space-y-5 glass-hover ${hot ? "border-primary/30" : ""}`}>
              <div className="flex items-center gap-4">
                {guild.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={guild.icon} className="w-12 h-12 rounded-2xl border border-white/[0.12]" alt="" />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                    <Server size={20} className="text-ink-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{guild.name}</p>
                  <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-1">
                    <span className="flex items-center gap-1"><Users size={12} /> {guild.memberCount}</span>
                    {listeners > 0 && (
                      <span className="flex items-center gap-1 text-primary"><Headphones size={12} /> {listeners} in voice</span>
                    )}
                  </div>
                </div>
                {hot && <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-soft" />}
              </div>

              {playing ? (
                <div className="bg-black/20 rounded-2xl px-4 py-3 border border-white/[0.08]">
                  <p className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">Now Playing</p>
                  <p className="text-sm font-medium truncate mt-1">{playing.title}</p>
                  <p className="text-[11px] text-ink-variant mt-0.5">{playing.duration}</p>
                </div>
              ) : (
                <div className="bg-black/20 rounded-2xl px-4 py-3 border border-white/[0.08] text-[12px] text-ink-muted">
                  Not playing
                </div>
              )}

              <button
                className="w-full btn-primary py-3"
                onClick={() => openPlayer(guild.id, hot)}
                disabled={joining === guild.id}
              >
                {joining === guild.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {hot ? "Open player" : "Open"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
