FROM node:18-slim AS builder

# Install Java runtime (OpenJDK 17) and curl (Debian based)
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre curl && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install bot dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot source code (including .env.example, entrypoint.sh, etc.)
COPY . .

# Define Lavalink version (can be overridden via build‑arg)
ARG LAVALINK_VERSION=4.1.1
ARG YOUTUBE_PLUGIN_VERSION=1.16.0

# Create directories for Lavalink files
RUN mkdir -p /opt/lavalink/plugins

# Download Lavalink JAR with retry and fail-on-error
RUN curl -fSL --retry 3 --retry-delay 2 -o /opt/lavalink/Lavalink.jar \
    https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar

# Download YouTube source plugin with retry and fail-on-error
RUN curl -fSL --retry 3 --retry-delay 2 -o /opt/lavalink/plugins/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar \
    https://github.com/lavalink-devs/youtube-source/releases/download/${YOUTUBE_PLUGIN_VERSION}/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar

# Copy Lavalink configuration (ensure this file exists in the repo)
COPY lavalink/application.yml /opt/lavalink/application.yml

# Copy and make entrypoint script executable (it's in the WORKDIR from COPY . .)
RUN chmod +x /usr/src/app/entrypoint.sh

# Expose Lavalink port (internal use only)
EXPOSE 2333

# Default host for the bot to connect to Lavalink (IPv4 localhost)
ENV LAVALINK_HOST=127.0.0.1

# Set working directory for the bot (already set above, but keep for clarity)
WORKDIR /usr/src/app

# Start both services (Lavalink → bot)
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
