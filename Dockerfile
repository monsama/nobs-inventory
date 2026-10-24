FROM node:22.22-alpine3.24
WORKDIR /app
ENV NODE_ENV=production NI_DATA=/data NI_PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY scripts/Lansweeper-Push.ps1 ./scripts/Lansweeper-Push.ps1
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["node", "server/index.js"]
