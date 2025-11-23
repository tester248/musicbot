# Discord Music Bot

A simple Discord music bot that plays audio from YouTube links.

## Prerequisites

- Python 3.8+
- FFmpeg (already installed in this environment)

## Setup

1.  **Create a Discord Bot:**
    - Go to the [Discord Developer Portal](https://discord.com/developers/applications).
    - Click "New Application".
    - Go to the "Bot" tab and click "Add Bot".
    - Copy the **Token**.

2.  **Configure the Bot:**
    - Open `bot.py`.
    - Replace `'YOUR_TOKEN_HERE'` with your actual bot token.

3.  **Invite the Bot:**
    - Go to the "OAuth2" -> "URL Generator" tab in the Developer Portal.
    - Select `bot` scope.
    - Select `Connect`, `Speak`, `Send Messages`, `Read Message History` permissions.
    - Copy the generated URL and open it in your browser to invite the bot to your server.

## Running the Bot

Run the following command in the terminal:

```bash
python bot.py
```

## Commands

- `!play <url>`: Plays audio from a YouTube URL.
- `!stop`: Stops playback and disconnects.
- `!leave`: Disconnects the bot.
- `!volume <0-100>`: Sets the volume.