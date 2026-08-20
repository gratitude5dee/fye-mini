FROM node:22-bookworm-slim

WORKDIR /srv/living-grimoire

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV GATEWAY_HOST=127.0.0.1 \
    GATEWAY_PORT=8787 \
    GATEWAY_APP_PORT=8788 \
    LIVING_GRIMOIRE_GATEWAY=true

CMD ["node", "gateway/server.mjs"]
