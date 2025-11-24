#!/bin/sh

# Write YouTube cookies if provided via env var (only if file doesn't already exist)
if [ -n "$YOUTUBE_COOKIES" ] && [ ! -f /opt/lavalink/cookies.txt ]; then
    echo "Creating cookies.txt from environment variable..."
    echo "$YOUTUBE_COOKIES" > /opt/lavalink/cookies.txt
elif [ -f /opt/lavalink/cookies.txt ]; then
    echo "Using existing cookies.txt file..."
fi

# Start Lavalink in background with explicit config file path
java -jar /opt/lavalink/Lavalink.jar --spring.config.location=/opt/lavalink/application.yml &
# Give Lavalink a moment to start up
sleep 15

# Start the Discord bot
node /usr/src/app/index.js
