#!/bin/sh

if [ -n "$YOUTUBE_COOKIES" ]; then
    echo "Creating cookies.txt from environment variable..."
    echo "$YOUTUBE_COOKIES" > cookies.txt
fi

exec java -jar Lavalink.jar
