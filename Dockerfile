FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Remove local lavalink folder from bot container to save space (it runs in its own container)
RUN rm -rf lavalink

CMD ["node", "index.js"]
