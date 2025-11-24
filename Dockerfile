FROM node:18-alpine AS builder

# Install Java runtime for Lavalink
RUN apk add --no-cache openjdk17-jre

WORKDIR /usr/src/app

# Copy bot source and install dependencies
COPY package*.json ./
RUN npm install --production
COPY . .

# Remove the separate lavalink folder from the final image (we'll copy only needed files)
# Copy Lavalink JAR and plugins
COPY lavalink/Lavalink.jar /opt/lavalink/Lavalink.jar
COPY lavalink/plugins/ /opt/lavalink/plugins/
COPY lavalink/application.yml /opt/lavalink/application.yml

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose Lavalink port (optional, not needed for internal use)
EXPOSE 2333

# Set working directory for the bot
WORKDIR /usr/src/app

# Use the entrypoint to start both services
ENTRYPOINT ["/entrypoint.sh"]
