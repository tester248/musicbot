# Node.js Discord Music Bot

A powerful Discord music bot built with Node.js, featuring YouTube and Spotify integration.

## Features

- 🎵 **Play music** from YouTube and Spotify
- 📝 **Queue system** with unlimited songs
- 🎛️ **Volume control** (0-100%)
- ⏯️ **Playback controls** (play, pause, resume, skip, stop)
- 🔀 **Search** by song name or direct URLs
- 📱 **Slash commands** + traditional text commands
- 🎨 **Rich embeds** with song information
- 🔗 **Spotify integration** (searches YouTube for playback)

## Commands

### Text Commands (prefix: !)
- `!play <song/url>` - Play a song or add to queue
- `!skip` - Skip current song
- `!stop` - Stop playback and clear queue
- `!pause` - Pause current song
- `!resume` - Resume paused song
- `!queue` - Show current queue
- `!nowplaying` - Show currently playing song
- `!volume <0-100>` - Set volume level
- `!join` - Join your voice channel
- `!leave` - Leave voice channel
- `!clear` - Clear the queue
- `!shuffle` - Shuffle the queue
- `!loop <off/track/queue>` - Set loop mode
- `!seek <seconds>` - Seek to a specific time
- `!lyrics [song]` - Get lyrics for a song

### Slash Commands
All text commands are also available as slash commands (e.g., `/play`, `/skip`, etc.)

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Edit the `.env` file with your credentials:

```env
# Discord Bot Token (required)
DISCORD_TOKEN=your_discord_bot_token_here

# Spotify API Credentials (optional but recommended)
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Bot Configuration
PREFIX=!
MAX_QUEUE_SIZE=100
DEFAULT_VOLUME=50
```

### 3. Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token to your `.env` file
4. Enable these bot permissions:
   - Send Messages
   - Use Slash Commands
   - Connect
   - Speak
   - Use Voice Activity

### 4. Spotify API Setup (Optional)
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy Client ID and Client Secret to your `.env` file

### 5. Run the Bot
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Supported Sources

- ✅ **YouTube** - Direct URLs and search
- ✅ **Spotify** - Track URLs (plays via YouTube)
- ✅ **Search** - Natural language search

## Example Usage

```
!play never gonna give you up
!play https://www.youtube.com/watch?v=dQw4w9WgXcQ
!play https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC

/play query:synthwave music
/volume level:75
/queue
```

## Requirements

- Node.js 18.0.0 or higher
- FFmpeg (automatically installed via ffmpeg-static)
- Discord bot token
- Internet connection

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check bot permissions and token
2. **No audio**: Ensure bot has "Connect" and "Speak" permissions
3. **Spotify not working**: Verify API credentials in `.env`
4. **Commands not showing**: Bot needs "Use Slash Commands" permission

### Performance Tips

- Keep queue size reasonable (default: 100 songs max)
- Use volume control instead of system volume
- Clear queue when done to free memory

## License

ISC License - Feel free to modify and distribute!