FROM node:24-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install --no-install-recommends --yes python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci
COPY ./ ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app/backend

RUN apt-get update \
    && apt-get install --no-install-recommends --yes libgomp1 tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=builder --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/backend/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod 755 ./docker-entrypoint.sh \
    && mkdir -p /app/backend/storage/ai-models \
    && chown -R node:node /app/backend/storage

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000 8296

ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
