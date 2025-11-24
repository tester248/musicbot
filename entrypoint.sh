#!/bin/sh

# Ensure /opt/lavalink directory exists
mkdir -p /opt/lavalink

# Write YouTube cookies if provided via env var (only if file doesn't already exist)
if [ -n "$YOUTUBE_COOKIES" ]; then
    if [ -f /opt/lavalink/cookies.txt ]; then
        echo "Using existing cookies.txt file..."
    else
        echo "Creating cookies.txt from environment variable..."
        echo "Cookie length: ${#YOUTUBE_COOKIES} characters"
        
        # Check if it's JSON format (starts with [ or {)
        if echo "$YOUTUBE_COOKIES" | grep -q '^\s*[\[{]'; then
            echo "Converting JSON cookies to Netscape format..."
            
            # Write JSON to temp file to avoid shell escaping issues
            echo "$YOUTUBE_COOKIES" > /tmp/cookies.json
            
            # Use Node.js to convert JSON to Netscape format
            node -e "
const fs = require('fs');
const cookies = JSON.parse(fs.readFileSync('/tmp/cookies.json', 'utf8'));
console.log('# Netscape HTTP Cookie File');
const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
cookieArray.forEach(c => {
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
            
            # Clean up temp file
            rm -f /tmp/cookies.json
            echo "Cookie conversion complete!"
        else
            # Assume it's already in Netscape format
            echo "Writing Netscape format cookies directly..."
            echo "$YOUTUBE_COOKIES" > /opt/lavalink/cookies.txt
        fi
        
        echo "Cookies file created at /opt/lavalink/cookies.txt"
        ls -lh /opt/lavalink/cookies.txt
    fi
else
    echo "No YOUTUBE_COOKIES environment variable found"
fi

# Start Lavalink in background with config import (Lavalink v4 / Spring Boot 3.x)
cd /opt/lavalink
java -jar Lavalink.jar &
cd /usr/src/app
# Give Lavalink a moment to start up
sleep 15

# Start the Discord bot
node /usr/src/app/index.js
