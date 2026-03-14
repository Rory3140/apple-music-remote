FROM node:18-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy server and remote UI
COPY server/ ./server/
COPY remote/ ./remote/

EXPOSE 8080

CMD ["node", "server/server.js"]
