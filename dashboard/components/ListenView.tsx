"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { api, art, formatDurationMs } from "@/lib/client";
import { useGuildPlayer, useLiveStats } from "@/lib/useLive";
import type { SearchTrack } from "@/lib/types";

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ListenView({ initialGuild }: { initialGuild: string | null }) {
  const { stats } = useLiveStats();
  const guilds = stats?.allGuilds || [];

  const [guildId, setGuildId] = useState<string | null>(initialGuild);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);

  const { player, loading, refresh, act } = useGuildPlayer(guildId);

  // Optimistic volume: slider reflects local drag instantly, synced from server.
  const [vol, setVol] = useState(100);
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (player && typeof player.volume === "number") setVol(player.volume);
  }, [player?.volume]);

  const changeVolume = (v: number) => {
    setVol(v);
    act("volume", v);
  };

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
      setResults(await api.search(guildId, q));
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
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Listen</h1>
          <p className="text-sm text-ink-muted mt-1">Control playback for a server</p>
        </div>
        <select value={guildId || ""} onChange={(e) => { setGuildId(e.target.value); setResults([]); refresh(); }} className="input !w-auto text-sm">
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </header>

      {/* Search */}
      <section className="glass p-5 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input !pl-11" placeholder="Search songs, artists…" value={query}
              onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
          </div>
          <button className="btn-primary px-6" onClick={doSearch} disabled={searching}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((t, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/[0.04] rounded-2xl px-4 py-3 hover:bg-white/[0.08] transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art(t.thumbnail, t.uri)} className="w-10 h-10 rounded-xl object-cover" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-[11px] text-ink-variant truncate">{t.author}</p>
                </div>
                <span className="text-[11px] text-ink-muted font-mono">{formatSec(t.duration / 1000)}</span>
                <button className="btn-primary text-xs px-4 h-9" onClick={() => playQuery(`${t.title} ${t.author}`)}>
                  <Play size={13} /> Play
                </button>
              </div>
            ))}
          </div>
        )}
        {query && results.length === 0 && !searching && (
          <p className="text-xs text-ink-muted text-center py-2">No results — try a different search.</p>
        )}
      </section>

      {/* Hero player */}
      <section className="glass-strong p-8 space-y-8">
        {np && player?.active ? (
          <>
            <div className="flex items-center gap-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art(np.thumbnail)} className="w-36 h-36 lg:w-44 lg:h-44 rounded-[2rem] object-cover border border-white/[0.12] shadow-2xl" alt="" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-ink-muted uppercase tracking-widest font-semibold">Now Playing</p>
                <h2 className="font-display text-2xl lg:text-3xl font-bold truncate leading-tight mt-2">{np.title}</h2>
                <p className="text-sm text-ink-variant mt-2">Added by @{np.requester} · {np.duration}</p>
              </div>
            </div>

            <div>
              <div className="h-1.5 bg-white/[0.12] rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full relative transition-[width] duration-1000" style={{ width: `${progress}%` }}>
                  <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/60 blur-[2px]" />
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-ink-muted font-mono mt-2">
                <span>{formatDurationMs(player.position)}</span>
                <span>{formatDurationMs(player.durationMs)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <button className="btn-icon rounded-full text-ink-variant" onClick={() => act("loop")} title="Loop">
                {player.loopMode === 1 ? <Repeat1 size={18} className="text-primary" /> : <Repeat size={18} />}
              </button>
              <button className="w-16 h-16 bg-primary text-surface rounded-full flex items-center justify-center hover:brightness-110 transition active:scale-95" onClick={() => act(player.paused ? "resume" : "pause")}>
                {player.paused ? <Play size={28} className="ml-1" /> : <Pause size={28} />}
              </button>
              <button className="btn-icon rounded-full text-ink-variant" onClick={() => act("skip")}>
                <SkipForward size={20} />
              </button>
              <button className="btn-icon rounded-full text-danger hover:text-danger" onClick={() => act("stop")}>
                <Square size={17} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <Volume2 size={16} className="text-ink-variant" />
              <input type="range" min={0} max={100} value={vol} onChange={(e) => changeVolume(Number(e.target.value))} className="w-40 accent-primary" />
              <span className="text-[11px] text-ink-variant font-mono">{vol}%</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 rounded-full bg-white/[0.05] flex items-center justify-center mb-5 border border-white/[0.1]">
              {loading ? <Loader2 size={36} className="animate-spin text-ink-muted" /> : <Music2 size={36} className="text-ink-muted" />}
            </div>
            {!loading && (
              <>
                <h3 className="font-display text-xl font-semibold">Nothing playing</h3>
                <p className="text-sm text-ink-muted mt-1">Search above to queue a song, or open a server.</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* Queue */}
      <section className="glass p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ListMusic size={17} className="text-ink-variant" />
          <h3 className="font-semibold text-sm">Queue</h3>
          {player && player.queue.length > 0 && (
            <span className="chip bg-white/[0.06] border-white/[0.12] text-ink-muted ml-auto">{player.queue.length}</span>
          )}
        </div>
        <div className="space-y-2">
          {player && player.queue.length > 0 ? (
            player.queue.map((t) => (
              <div key={t.index} className="flex items-center gap-3 bg-white/[0.03] rounded-2xl px-4 py-3">
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
