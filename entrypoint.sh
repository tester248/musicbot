#!/bin/sh

# Write YouTube cookies if provided via env var
if [ -n "$YOUTUBE_COOKIES" ]; then
    echo "Creating cookies.txt from environment variable..."
    echo "$YOUTUBE_COOKIES" > /opt/lavalink/cookies.txt
fi

# Start Lavalink in background
java -jar /opt/lavalink/Lavalink.jar &
# Give Lavalink a moment to start up
sleep 5

# Start the Discord bot
node /usr/src/app/index.js
