export interface NodeStats {
  name: string;
  state: number;
  players: number;
  cpu: string;
  memory: string;
}

export interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  isActive: boolean;
}

export interface Listener {
  id: string;
  username: string;
  avatar: string;
  guildName: string;
  channelName: string;
}

export interface NowPlayingInfo {
  title: string;
  thumbnail: string;
  requester: string;
  duration: string;
}

export interface ActiveGuild {
  id: string;
  name: string;
  icon: string | null;
  nodeName: string;
  position: number;
  durationMs: number;
  nowPlaying: NowPlayingInfo;
  queue: { title: string; requester: string }[];
}

export interface Stats {
  totalGuilds: number;
  totalMembers: number;
  activePlayers: number;
  nodes: NodeStats[];
  allGuilds: GuildSummary[];
  activeListeners: Listener[];
  activeGuilds: ActiveGuild[];
}

export interface QueueTrack {
  index: number;
  title: string;
  duration: string;
  requester: string;
}

export interface PlayerState {
  guildId: string;
  active: boolean;
  guildName: string;
  nowPlaying: NowPlayingInfo | null;
  queue: QueueTrack[];
  paused: boolean;
  position: number;
  durationMs: number;
  volume: number;
  loopMode: number;
}

export interface SearchTrack {
  title: string;
  author: string;
  duration: number;
  uri: string;
  thumbnail: string;
  encoded: string;
}

export type PlayerAction =
  | "pause"
  | "resume"
  | "skip"
  | "stop"
  | "volume"
  | "seek"
  | "loop";
