# Discord Music Bot 🎵

A high‑performance Discord music bot built with **Node.js**, **Discord.js**, and **Lavalink** (via Shoukaku).

## Features ✨

- **High Quality Audio** – Powered by Lavalink for stable, clear playback.
- **Reliable Playback** 🛡️ – Automatically retries failed tracks using different YouTube clients and falls back to Spotify/SoundCloud if necessary.
- **Public Nodes** 🌐 – Integrated with public Lavalink nodes (AjieDev, Serenetia) for high availability.
- **Multi‑Source Support**:
  - YouTube (search, direct links, playlists)
  - Spotify (tracks, playlists)
  - SoundCloud
- **UI Enhancements** – "Now Playing" announcements and a clean `/help` menu.
- **Dual Command System** – Slash commands (`/play`) **and** prefix commands (`!play`).
- **Robust Queue** – Loop, shuffle, seek, clear, etc.
- **Lyrics** – Fetch lyrics via Genius.

## Prerequisites 📋

- **Node.js** v18+ (recommended LTS)
- **Java** v17+ (required for Lavalink)

## Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd musicbot
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Create a `.env` file** (see the **Environment Variables** section below).
4. **Start Lavalink** (Optional if using public nodes, otherwise run locally)
   ```bash
   cd lavalink
   java -jar Lavalink.jar
   ```
5. **Run the bot**
   ```bash
   node index.js
   ```

## Environment Variables

Create a file named `.env` in the project root with the following keys:

```env
DISCORD_TOKEN=your_discord_bot_token
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
PREFIX=!               # optional, defaults to '!'
DEFAULT_VOLUME=100     # optional, defaults to 100
YOUTUBE_REFRESH_TOKEN= # optional, enables YouTube OAuth if provided
LAVALINK_HOST=localhost # optional, defaults to localhost
```

- `DISCORD_TOKEN` – Bot token from the Discord developer portal.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` – Credentials from the Spotify developer dashboard.
- `YOUTUBE_REFRESH_TOKEN` – (Optional) Provide a YouTube OAuth refresh token to avoid age restrictions/rate limits. If omitted, OAuth is disabled.

## Commands 🎮

| Command | Description |
|---|---|
| `/play <query>` | Play a song from YouTube, Spotify, or SoundCloud |
| `/skip` | Skip the current song |
| `/stop` | Stop playback and clear the queue |
| `/pause` | Pause the current song |
| `/resume` | Resume playback |
| `/queue` | Show the current queue |
| `/nowplaying` | Show the currently playing song |
| `/volume <0‑100>` | Adjust the volume |
| `/loop <mode>` | Set loop mode (off, track, queue) |
| `/shuffle` | Shuffle the queue |
| `/seek <seconds>` | Seek to a specific time |
| `/lyrics` | Get lyrics for the current song |
| `/join` | Join your voice channel |
| `/leave` | Leave the voice channel |
| `/clear` | Clear the queue |
| `/help` | Show all available commands |

## Troubleshooting 🔧

- **Playback Failures**: The bot automatically retries failed tracks up to 4 times using different clients. If that fails, it searches Spotify/SoundCloud as a fallback.
- **Lavalink Connection**: The bot connects to local and public nodes. If one fails, it uses another.

## Deploying to Koyeb (single‑container) 🚀

Koyeb only allows one Docker container per service, so we bundle Lavalink and the Discord bot together.

### 1️⃣ Build & Push the Image
The repository already contains a `Dockerfile` that builds a single image with both services. Build it locally and push it to a registry.
```bash
docker build -t yourusername/musicbot:latest .
docker push yourusername/musicbot:latest
```

### 2️⃣ Set Environment Variables in Koyeb
In the Koyeb service configuration, add the following variables:
```env
DISCORD_TOKEN=your_discord_bot_token
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
YOUTUBE_REFRESH_TOKEN=your_token # optional
```

### 3️⃣ Deploy
Click **Deploy**. The container’s entrypoint will:
1. Check for `YOUTUBE_REFRESH_TOKEN` and enable OAuth if present.
2. Launch Lavalink.
3. Start the Discord bot.

Your bot should now be online and ready to accept commands!

## License 📄

ISC