"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { PlayerAction, PlayerState, Stats } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export function useLiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(BASE || undefined);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("stats", (data: Stats) => setStats(data));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { stats, connected, socket: socketRef };
}

export function useGuildPlayer(guildId: string | null) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(BASE || undefined);
    socketRef.current = socket;
    socket.on("player:state", (state: PlayerState) => {
      if (state?.guildId === guildId) setPlayer(state);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [guildId]);

  const refresh = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const { api } = await import("./client");
      const state = await api.player(guildId);
      setPlayer(state);
    } catch {
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    if (guildId) refresh();
  }, [guildId, refresh]);

  const act = useCallback(
    (action: PlayerAction, value?: number) => {
      const socket = socketRef.current;
      if (!socket || !guildId) return;
      socket.emit("player:action", { guildId, action, value });
    },
    [guildId],
  );

  return { player, loading, refresh, act, socket: socketRef };
}
