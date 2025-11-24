FROM node:18-alpine AS builder

# Install Java runtime and curl for downloading Lavalink
RUN apk add --no-cache openjdk17-jre curl

WORKDIR /usr/src/app

# Copy bot source and install dependencies
COPY package*.json ./
RUN npm install --production
COPY . .

# Define versions (you can override via build args)
ARG LAVALINK_VERSION=3.7.5
ARG YOUTUBE_PLUGIN_VERSION=1.6.0

# Create directories for Lavalink
RUN mkdir -p /opt/lavalink/plugins

# Download Lavalink JAR
RUN curl -L -o /opt/lavalink/Lavalink.jar \
    https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar

# Download YouTube source plugin
RUN curl -L -o /opt/lavalink/plugins/youtube-plugin.jar \
    https://github.com/lavalink-devs/youtube-source/releases/download/${YOUTUBE_PLUGIN_VERSION}/youtube-plugin.jar

# Copy application.yml (ensure it exists in repo)
COPY lavalink/application.yml /opt/lavalink/application.yml

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose Lavalink port (optional)
EXPOSE 2333

# Set working directory for the bot
WORKDIR /usr/src/app

ENTRYPOINT ["/entrypoint.sh"]
