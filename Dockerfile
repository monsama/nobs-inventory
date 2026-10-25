FROM node:26.12-alpine3.24
# Security fixes Alpine has published since the base image was built (OpenSSL, ...).
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production NI_DATA=/data NI_PORT=8080
COPY package.json package-lock.json ./
# npm is only needed to install. It is removed afterwards, so the dependencies it bundles (tar, sigstore, ...) are not in the image.
RUN npm ci --omit=dev && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm
COPY server ./server
COPY public ./public
COPY scripts/Lansweeper-Push.ps1 ./scripts/Lansweeper-Push.ps1
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["node", "server/index.js"]
