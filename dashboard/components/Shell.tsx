"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, RadioTower, Server, Sparkles } from "lucide-react";
import { useLiveStats } from "@/lib/useLive";
import MiniPlayer from "./MiniPlayer";

const NAV = [
  { href: "/", label: "Listen", icon: Headphones },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/network", label: "Network", icon: RadioTower },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { stats, connected } = useLiveStats();

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="flex flex-1 overflow-hidden">
        {/* Rail */}
        <nav className="w-[76px] shrink-0 flex flex-col items-center py-6 gap-8 border-r border-white/[0.08] bg-white/[0.02] backdrop-blur-2xl">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
            <Sparkles size={20} />
          </div>

          <div className="flex flex-col gap-3">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href === "/" && pathname.startsWith("/listen"));
              return (
                <Link key={href} href={href} title={label}>
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      active
                        ? "bg-white/[0.12] border border-white/[0.2] text-primary shadow-[0_0_20px_-6px_rgba(16,185,129,0.5)]"
                        : "text-ink-muted hover:bg-white/[0.06] hover:text-ink border border-transparent"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-primary animate-pulse-soft" : "bg-warn"}`} />
            <span className="text-[9px] uppercase tracking-widest text-ink-muted rotate-180 [writing-mode:vertical-rl]">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin px-6 lg:px-10 py-8 pb-32">
          {children}
        </main>
      </div>

      {/* Persistent bottom player */}
      <MiniPlayer stats={stats} />
    </div>
  );
}
