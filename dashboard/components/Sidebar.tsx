"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Headphones,
  LayoutGrid,
  ListMusic,
  Music2,
  PanelTop,
  Settings,
  Users,
} from "lucide-react";
import type { GuildSummary } from "@/lib/types";
import { api } from "@/lib/client";
import { useState } from "react";

interface SidebarProps {
  guilds: GuildSummary[];
  activeGuildIds: Set<string>;
  listenerGuildNames: Set<string>;
}

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/player", label: "Player", icon: Music2 },
];

export default function Sidebar({ guilds, activeGuildIds, listenerGuildNames }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);

  const openPlayer = async (guildId: string, join: boolean) => {
    setJoining(guildId);
    try {
      if (join) await api.join(guildId);
      router.push(`/player?guild=${guildId}`);
    } catch (e) {
      alert(`Could not join voice channel: ${(e as Error).message}`);
    } finally {
      setJoining(null);
    }
  };

  return (
    <aside className="w-72 shrink-0 hidden lg:flex flex-col glass border-r border-transparent rounded-none h-screen sticky top-0">
      <div className="p-6 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/15 text-primary rounded-xl">
            <Headphones size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight leading-none">DJ Tester</h1>
            <p className="text-[11px] text-ink-muted mt-1 font-medium uppercase tracking-wider">Overseer</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/12 text-primary border border-primary/20"
                    : "text-ink-variant hover:bg-white/[0.04] hover:text-ink border border-transparent"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6 space-y-1">
        <div className="px-2 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Servers</span>
          <span className="chip bg-white/[0.04] border border-white/[0.08] text-ink-muted">{guilds.length}</span>
        </div>

        {guilds.map((guild) => {
          const active = activeGuildIds.has(guild.id);
          const hasListeners = listenerGuildNames.has(guild.name);
          return (
            <div
              key={guild.id}
              className={`group flex items-center gap-3 p-2 rounded-lg transition-colors border-l-2 ${
                active
                  ? "bg-primary/8 border-primary"
                  : "border-transparent hover:bg-white/[0.03]"
              }`}
            >
              {guild.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guild.icon} alt="" className="w-8 h-8 rounded-full shadow" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center">
                  <Users size={14} className="text-ink-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{guild.name}</p>
                <p className="text-[10px] text-ink-muted">{guild.memberCount} members</p>
              </div>

              {(active || hasListeners) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openPlayer(guild.id, true);
                  }}
                  disabled={joining === guild.id}
                  className="btn-primary text-[10px] h-7 px-2.5"
                >
                  <PanelTop size={13} />
                  {joining === guild.id ? "Joining…" : "Open player"}
                </button>
              )}
              {!active && !hasListeners && (
                <button
                  onClick={() => openPlayer(guild.id, false)}
                  className="btn-ghost text-[10px] h-7 px-2.5 opacity-0 group-hover:opacity-100"
                >
                  <ListMusic size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/[0.05]">
        <div className="flex items-center gap-3 px-2 text-sm text-ink-variant">
          <Activity size={15} strokeWidth={1.75} />
          <span className="text-[11px]">Connected live</span>
        </div>
      </div>
    </aside>
  );
}
