"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { api, formatDurationMs } from "@/lib/client";
import { useGuildPlayer, useLiveStats } from "@/lib/useLive";
import type { SearchTrack } from "@/lib/types";

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialGuild = params.get("guild");

  const { stats } = useLiveStats();
  const guilds = stats?.allGuilds || [];

  const [guildId, setGuildId] = useState<string | null>(initialGuild);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);

  const { player, loading, refresh, act } = useGuildPlayer(guildId);

  useEffect(() => {
    if (initialGuild) setGuildId(initialGuild);
  }, [initialGuild]);

  useEffect(() => {
    if (!guildId && guilds.length > 0) {
      const active = (stats?.activeGuilds || [])[0];
      setGuildId(active ? active.id : guilds[0].id);
    }
  }, [guilds, stats, guildId]);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !guildId) return;
    setSearching(true);
    try {
      const tracks = await api.search(guildId, q);
      setResults(tracks);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, guildId]);

  const playQuery = useCallback(
    async (q: string) => {
      if (!guildId) return;
      try {
        await api.play(guildId, q);
        setResults([]);
        setQuery("");
        setTimeout(refresh, 900);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [guildId, refresh],
  );

  const np = player?.nowPlaying;
  const progress = player?.durationMs ? Math.min(100, (player.position / player.durationMs) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-8">
      <header className="flex items-center gap-4">
        <button className="btn-icon" onClick={() => router.push("/")} title="Back to overview">
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight">Player</h1>
        </div>
        <select
          value={guildId || ""}
          onChange={(e) => {
            const id = e.target.value;
            setGuildId(id);
            setResults([]);
            refresh();
          }}
          className="input !w-auto text-sm"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </header>

      {/* Search */}
      <section className="glass p-4 rounded-2xl space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input !pl-10"
              placeholder="Search songs, artists…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
          </div>
          <button className="btn-primary px-5" onClick={doSearch} disabled={searching}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3 hover:bg-white/[0.06] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.thumbnail || "https://via.placeholder.com/40"} className="w-10 h-10 rounded-lg object-cover" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-[11px] text-ink-variant truncate">{t.author}</p>
                </div>
                <span className="text-[11px] text-ink-muted font-mono">{formatSec(t.duration / 1000)}</span>
                <button className="btn-primary text-xs px-3.5 h-8" onClick={() => playQuery(`${t.title} ${t.author}`)}>
                  <Play size={13} />
                  Play
                </button>
              </div>
            ))}
          </div>
        )}
        {query && results.length === 0 && !searching && (
          <p className="text-xs text-ink-muted text-center py-2">No results — try a different search.</p>
        )}
      </section>

      {/* Now Playing */}
      <section className="glass p-6 rounded-3xl space-y-6">
        {np && player?.active ? (
          <>
            <div className="flex items-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={np.thumbnail || "https://via.placeholder.com/128"}
                className="w-32 h-32 rounded-2xl object-cover shadow-2xl border border-white/[0.06]"
                alt=""
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-ink-muted uppercase tracking-widest font-semibold">Now Playing</p>
                <h3 className="font-display text-xl font-bold truncate leading-tight mt-1">{np.title}</h3>
                <p className="text-sm text-ink-variant mt-1">Added by @{np.requester} · {np.duration}</p>
              </div>
            </div>

            <div>
              <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full relative transition-[width] duration-1000" style={{ width: `${progress}%` }}>
                  <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 blur-[2px]" />
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-ink-muted font-mono mt-1.5">
                <span>{formatDurationMs(player.position)}</span>
                <span>{formatDurationMs(player.durationMs)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button className="btn-icon text-ink-variant" onClick={() => act("loop")} title="Loop">
                {player.loopMode === 1 ? <Repeat1 size={17} className="text-primary" /> : <Repeat size={17} />}
              </button>
              <button
                className="w-14 h-14 bg-primary text-surface rounded-full flex items-center justify-center hover:bg-primary-hover transition shadow-neon"
                onClick={() => act(player.paused ? "resume" : "pause")}
                title={player.paused ? "Resume" : "Pause"}
              >
                {player.paused ? <Play size={24} className="ml-0.5" /> : <Pause size={24} />}
              </button>
              <button className="btn-icon text-ink-variant" onClick={() => act("skip")} title="Skip">
                <SkipForward size={18} />
              </button>
              <button className="btn-icon text-danger hover:text-danger" onClick={() => act("stop")} title="Stop">
                <Square size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Volume2 size={15} className="text-ink-variant" />
              <input
                type="range"
                min={0}
                max={100}
                value={player.volume}
                onChange={(e) => act("volume", Number(e.target.value))}
                className="w-32 accent-primary"
              />
              <span className="text-[11px] text-ink-variant font-mono">{player.volume}%</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
              <Music2 size={36} className="text-ink-muted" />
            </div>
            {loading ? (
              <Loader2 size={20} className="animate-spin text-ink-muted" />
            ) : (
              <>
                <h3 className="font-display text-lg font-semibold">Nothing playing</h3>
                <p className="text-sm text-ink-muted mt-1">Search above to queue a song.</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* Queue */}
      <section className="glass p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <ListMusic size={16} className="text-ink-variant" />
          <h3 className="font-semibold text-sm">Queue</h3>
          {player && player.queue.length > 0 && (
            <span className="chip bg-white/[0.04] border border-white/[0.08] text-ink-muted ml-auto">{player.queue.length}</span>
          )}
        </div>
        <div className="space-y-1.5">
          {player && player.queue.length > 0 ? (
            player.queue.map((t) => (
              <div key={t.index} className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3.5 py-2.5">
                <span className="w-5 text-center text-[11px] text-ink-muted font-mono">{t.index + 1}</span>
                <span className="flex-1 text-sm truncate">{t.title}</span>
                <span className="text-[11px] text-ink-muted font-mono shrink-0">{t.duration}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-ink-muted text-center py-4">Queue is empty.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
      <PlayerInner />
    </Suspense>
  );
}
