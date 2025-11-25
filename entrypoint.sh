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

# Start Lavalink in background with config import (Lavalink v4 / Spring Boot 3.x)
cd /opt/lavalink
java -jar Lavalink.jar &
cd /usr/src/app
# Give Lavalink a moment to start up
sleep 15

# Start the Discord bot
node /usr/src/app/index.js
