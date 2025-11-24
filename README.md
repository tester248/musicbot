# Discord Music Bot 🎵

A high-performance Discord music bot built with **Node.js**, **Discord.js**, and **Lavalink** (via Shoukaku).

## Features ✨

*   **High Quality Audio**: Powered by Lavalink for stable and clear playback.
*   **Multi-Source Support**:
    *   YouTube (Search, Direct Links, Playlists)
    *   Spotify (Tracks, Playlists)
    *   SoundCloud
*   **Dual Command System**: Supports both Slash Commands (`/play`) and Prefix Commands (`!play`).
*   **Robust Queue System**: Loop, Shuffle, Seek, and more.
*   **Lyrics**: Fetch lyrics for the current song.

## Prerequisites 📋

*   **Node.js** (v18 or higher)
*   **Java** (v17 or higher) for Lavalink

## Installation 🛠️

1.  **Clone the repository**:
    ```bash
    git clone <your-repo-url>
    cd musicbot
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Environment Variables**:
    Create a `.env` file in the root directory:
    ```env
    DISCORD_TOKEN=your_discord_bot_token
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    PREFIX=!
    DEFAULT_VOLUME=100
    ```

4.  **Lavalink Setup**:
    *   Download `Lavalink.jar` and place it in the `lavalink` folder.
    *   Ensure `application.yml` is configured correctly in the `lavalink` folder.

## Running the Bot 🚀

1.  **Start Lavalink** (in a separate terminal):
    ```bash
    cd lavalink
    java -jar Lavalink.jar
    ```

2.  **Start the Bot**:
    ```bash
    node index.js
    ```

## Commands 🎮

| Command | Description |
| :--- | :--- |
| `/play <query>` | Play a song from YouTube, Spotify, or SoundCloud |
| `/pause` | Pause the current track |
| `/resume` | Resume playback |
| `/skip` | Skip to the next song |
| `/stop` | Stop playback and clear the queue |
| `/queue` | Show the current queue |
| `/volume <0-100>` | Adjust the volume |
| `/loop <mode>` | Set loop mode (off, track, queue) |
| `/shuffle` | Shuffle the queue |
| `/seek <seconds>` | Seek to a specific time in the track |
| `/lyrics` | Get lyrics for the current song |

## Troubleshooting 🔧

*   **YouTube Errors**: If you encounter "Sign in" errors, try using SoundCloud (`!play scsearch:song`) or check your Lavalink `application.yml` configuration.
*   **Spotify Issues**: Ensure your Spotify Client ID and Secret are correct in `.env`.

## License 📄

ISC