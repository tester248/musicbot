# Discord Music Bot 🎵

A high‑performance Discord music bot built with **Node.js**, **Discord.js**, and **Lavalink** (via Shoukaku).

## Features ✨

- **High Quality Audio** – Powered by Lavalink for stable, clear playback.
- **Multi‑Source Support**:
  - YouTube (search, direct links, playlists)
  - Spotify (tracks, playlists)
  - SoundCloud
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
4. **Start Lavalink** (in a separate terminal)
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
YOUTUBE_COOKIES=your_cookies_content   # optional – paste the entire content of `cookies.txt`
```

- `DISCORD_TOKEN` – Bot token from the Discord developer portal.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` – Credentials from the Spotify developer dashboard.
- `PREFIX` – Command prefix for the legacy text‑based commands (default `!`).
- `DEFAULT_VOLUME` – Starting volume (0‑100).
- `YOUTUBE_COOKIES` – If YouTube starts returning *sign‑in* errors, paste the raw content of your `cookies.txt` here. The entrypoint script will write this to a file for Lavalink.

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
| `/loop <off|track|queue>` | Set loop mode |
| `/shuffle` | Shuffle the queue |
| `/seek <seconds>` | Seek to a specific time |
| `/lyrics` | Get lyrics for the current song |

## Troubleshooting 🔧

- **YouTube “Sign‑in” errors** – Try adding your cookies via `YOUTUBE_COOKIES` or use a SoundCloud search (`!play scsearch:track`).
- **Spotify issues** – Verify that the client ID/secret are correct and that the bot has internet access.

## Deploying to Koyeb (single‑container) 🚀

Koyeb only allows one Docker container per service, so we bundle Lavalink and the Discord bot together.

### 1️⃣ Build & Push the Image
The repository already contains a `Dockerfile` that builds a single image with both services. Build it locally and push it to a registry (Docker Hub, GitHub Packages, etc.).
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
PREFIX=!               # optional
DEFAULT_VOLUME=100     # optional
YOUTUBE_COOKIES=your_cookies_content   # optional – paste the whole `cookies.txt`
```
> **Tip:** If the cookie string is very long, you can base64‑encode it and decode it in the entrypoint script, but plain text works for most cases.

### 3️⃣ Ports
The container exposes port **2333** (Lavalink). Koyeb will map it automatically; the bot connects to `localhost:2333` inside the same container, so you don’t need to expose it publicly.

### 4️⃣ Deploy
After setting the env vars, click **Deploy**. The container’s entrypoint will:
1. Write `cookies.txt` (if `YOUTUBE_COOKIES` is set).
2. Launch Lavalink.
3. Wait a few seconds for Lavalink to be ready.
4. Start the Discord bot.

Your bot should now be online and ready to accept commands.

---

*If you prefer not to store cookies in env vars, you can add `cookies.txt` to the repository (it’s ignored by `.gitignore`). The entrypoint will copy it automatically.*

## License 📄

ISC