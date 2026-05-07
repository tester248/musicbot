#!/bin/sh

# Ensure /opt/lavalink directory exists
mkdir -p /opt/lavalink

# Check if Refresh Token is present to enable OAuth
if [ -n "$YOUTUBE_REFRESH_TOKEN" ]; then
    export YOUTUBE_OAUTH_ENABLED=true
    echo "✅ YouTube OAuth Enabled"
else
    export YOUTUBE_OAUTH_ENABLED=false
    echo "ℹ️ YouTube OAuth Disabled (No token provided)"
fi

# Start Lavalink if enabled
if [ "${USE_LOCAL_LAVALINK}" = "false" ]; then
    echo "⏩ USE_LOCAL_LAVALINK is false. Skipping local Lavalink startup to save RAM..."
else
    echo "🚀 Starting local Lavalink server..."
    cd /opt/lavalink
    java -jar Lavalink.jar &
    cd /usr/src/app
    echo "⏳ Waiting for local Lavalink to initialize..."
    sleep 15
fi

# Start the Discord bot
node /usr/src/app/index.js
