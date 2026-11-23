import type { PlayerState, SearchTrack, Stats } from "./types";

// In dev (next dev) point this at the running bot server, e.g. http://localhost:3000
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => fetch(`${BASE}/api/stats`).then((r) => parse<Stats>(r)),

  player: (guildId: string) =>
    fetch(`${BASE}/api/player?guildId=${encodeURIComponent(guildId)}`).then((r) =>
      parse<PlayerState>(r),
    ),

  search: (guildId: string, query: string) =>
    fetch(`${BASE}/api/player/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId, query }),
    }).then((r) => parse<{ tracks: SearchTrack[] }>(r)).then((d) => d.tracks),

  play: (guildId: string, query: string) =>
    fetch(`${BASE}/api/player/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId, query }),
    }).then((r) => parse<{ ok: boolean }>(r)),

  join: (guildId: string) =>
    fetch(`${BASE}/api/player/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId }),
    }).then((r) => parse<{ ok: boolean }>(r)),
};

export function formatDurationMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDurationHuman(str: string): string {
  return str || "0:00";
}
