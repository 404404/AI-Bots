ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS checked
WORKDIR /opt/bot
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY test ./test
COPY scripts ./scripts
COPY deploy ./deploy
COPY LICENSE NOTICE.md ./
RUN npm test && npm run build

FROM ${NODE_IMAGE} AS runtime
ARG SOURCE_REVISION
ARG SECURITY_REFRESH=2026-10-29
LABEL org.opencontainers.image.title="GK50 Standalone Bot" \
      org.opencontainers.image.source="https://github.com/404404/AI-Bots" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.404404.product="standalone-bot"
RUN test -n "$SECURITY_REFRESH" && apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && groupadd --gid 10001 bot && useradd --uid 10001 --gid bot --no-create-home bot \
 && install -d -m 0700 -o bot -g bot /data/bot
WORKDIR /opt/bot
COPY --from=checked /opt/bot/node_modules ./node_modules
COPY --from=checked /opt/bot/dist ./dist
COPY package.json package-lock.json LICENSE NOTICE.md ./
ENV NODE_ENV=production BOT_IN_CONTAINER=1 BOT_HOST=0.0.0.0 BOT_PORT=3080 BOT_DATA_DIR=/data/bot
USER 10001:10001
EXPOSE 3080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD ["node","-e","fetch('http://127.0.0.1:3080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","--experimental-strip-types","dist/server.ts"]
