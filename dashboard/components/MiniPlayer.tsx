"use client";

import { useRouter } from "next/navigation";
import { Pause, Play, SkipForward, Square } from "lucide-react";
import type { Stats } from "@/lib/types";
import { useGuildPlayer } from "@/lib/useLive";
import { formatDurationMs } from "@/lib/client";

export default function MiniPlayer({ stats }: { stats: Stats | null }) {
  const router = useRouter();
  const active = stats?.activeGuilds?.[0];

  const { player, act } = useGuildPlayer(active?.id || null);

  if (!active || !player?.active || !player.nowPlaying) return null;

  const np = player.nowPlaying;
  const progress = player.durationMs ? Math.min(100, (player.position / player.durationMs) * 100) : 0;

  return (
    <div className="fixed bottom-4 inset-x-0 z-40 px-4">
      <div className="max-w-4xl mx-auto glass-strong flex items-center gap-4 px-4 py-3 rounded-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={np.thumbnail || "https://via.placeholder.com/40"} className="w-11 h-11 rounded-full object-cover border border-white/[0.15]" alt="" />

        <button
          onClick={() => router.push(`/listen?guild=${active.id}`)}
          className="text-left min-w-0 flex-1"
        >
          <p className="text-sm font-semibold truncate">{np.title}</p>
          <p className="text-[11px] text-ink-variant truncate">{active.name} · {np.duration}</p>
        </button>

        <div className="hidden sm:block w-32">
          <div className="h-1 bg-white/[0.15] rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-ink-muted font-mono mt-1">
            <span>{formatDurationMs(player.position)}</span>
            <span>{formatDurationMs(player.durationMs)}</span>
          </div>
        </div>

        <button className="btn-icon rounded-full" onClick={() => act(player.paused ? "resume" : "pause")}>
          {player.paused ? <Play size={18} className="ml-0.5" /> : <Pause size={18} />}
        </button>
        <button className="btn-icon rounded-full" onClick={() => act("skip")}>
          <SkipForward size={18} />
        </button>
        <button className="btn-icon rounded-full text-danger hover:text-danger" onClick={() => act("stop")}>
          <Square size={16} />
        </button>
      </div>
    </div>
  );
}
