#!/bin/sh

# Write YouTube cookies if provided via env var (only if file doesn't already exist)
if [ -n "$YOUTUBE_COOKIES" ] && [ ! -f /opt/lavalink/cookies.txt ]; then
    echo "Creating cookies.txt from environment variable..."
    
    # Check if it's JSON format (starts with [ or {)
    if echo "$YOUTUBE_COOKIES" | grep -q '^\s*[\[{]'; then
        echo "Converting JSON cookies to Netscape format..."
        # Use Node.js to convert JSON to Netscape format
        node -e "
const cookies = $YOUTUBE_COOKIES;
console.log('# Netscape HTTP Cookie File');
cookies.forEach(c => {
    const domain = c.domain || '';
    const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const path = c.path || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expirationDate || Math.floor(Date.now() / 1000) + 31536000;
    const name = c.name || '';
    const value = c.value || '';
    console.log(\`\${domain}\t\${flag}\t\${path}\t\${secure}\t\${expiry}\t\${name}\t\${value}\`);
});
" > /opt/lavalink/cookies.txt
    else
        # Assume it's already in Netscape format
        echo "$YOUTUBE_COOKIES" > /opt/lavalink/cookies.txt
    fi
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
