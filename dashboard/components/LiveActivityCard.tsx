"use client";

import { Pause, Play, SkipForward, Square, Users } from "lucide-react";
import type { ActiveGuild } from "@/lib/types";
import { formatDurationMs } from "@/lib/client";
import { useRef, useEffect, useState } from "react";

interface Props {
  guild: ActiveGuild;
  onAction: (guildId: string, action: "pause" | "resume" | "skip" | "stop") => void;
}

export default function LiveActivityCard({ guild, onAction }: Props) {
  const [pos, setPos] = useState(guild.position);
  const [paused, setPaused] = useState(false);

  // local ticking for smooth progress (mirrors server player position)
  useEffect(() => {
    setPos(guild.position);
    const interval = setInterval(() => {
      setPos((p) => (p < guild.durationMs ? p + 1000 : p));
    }, 1000);
    return () => clearInterval(interval);
  }, [guild.id, guild.position, guild.durationMs, paused]);

  const progress = guild.durationMs > 0 ? (pos / guild.durationMs) * 100 : 0;

  return (
    <div className="glass p-5 space-y-4 glass-hover border border-white/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-soft" />
          <span className="text-[11px] font-semibold text-ink truncate">{guild.name}</span>
        </div>
        <span className="chip bg-primary/10 border border-primary/25 text-primary">{guild.nodeName}</span>
      </div>

      <div className="flex gap-4">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={guild.nowPlaying.thumbnail || "https://via.placeholder.com/96"}
            className="w-24 h-24 rounded-2xl object-cover border border-white/[0.06]"
            alt=""
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-ink-muted uppercase tracking-widest font-semibold">Now Playing</p>
          <h4 className="font-bold text-sm truncate mt-0.5">{guild.nowPlaying.title}</h4>
          <p className="text-[11px] text-ink-variant mt-0.5">Added by @{guild.nowPlaying.requester}</p>

          <div className="mt-3">
            <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full relative" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/40 blur-[2px]" />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-ink-muted font-mono mt-1">
              <span>{formatDurationMs(pos)}</span>
              <span>{guild.nowPlaying.duration}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-white/[0.05] flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-variant mr-auto">
          <Users size={13} />
          <span>{guild.queue.length} queued</span>
        </div>
        <button className="btn-icon" onClick={() => onAction(guild.id, paused ? "resume" : "pause")} title={paused ? "Resume" : "Pause"}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button className="btn-icon" onClick={() => onAction(guild.id, "skip")} title="Skip">
          <SkipForward size={16} />
        </button>
        <button className="btn-icon text-danger hover:text-danger" onClick={() => onAction(guild.id, "stop")} title="Stop">
          <Square size={15} />
        </button>
      </div>
    </div>
  );
}
