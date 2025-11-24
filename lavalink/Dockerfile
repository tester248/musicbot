FROM eclipse-temurin:17-jre-alpine

WORKDIR /opt/lavalink

# Copy the local lavalink folder contents (Jar, config, plugins)
COPY . .

# Copy and setup entrypoint
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 2333

ENTRYPOINT ["./entrypoint.sh"]
