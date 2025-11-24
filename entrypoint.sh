#!/bin/sh

# Write YouTube cookies if provided via env var (only if file doesn't already exist)
if [ -n "$YOUTUBE_COOKIES" ] && [ ! -f /opt/lavalink/cookies.txt ]; then
    echo "Creating cookies.txt from environment variable..."
    echo "$YOUTUBE_COOKIES" > /opt/lavalink/cookies.txt
elif [ -f /opt/lavalink/cookies.txt ]; then
    echo "Using existing cookies.txt file..."
fi

# Start Lavalink in background with config import (Lavalink v4 / Spring Boot 3.x)
cd /opt/lavalink
java -jar Lavalink.jar &
cd /usr/src/app
# Give Lavalink a moment to start up
sleep 15

# Start the Discord bot
node /usr/src/app/index.js
