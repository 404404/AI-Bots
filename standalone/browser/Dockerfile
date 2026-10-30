FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="404404 AI-Bots standalone browser service" \
      org.opencontainers.image.source="https://github.com/404404/AI-Bots" \
      org.opencontainers.image.licenses="MIT AND Apache-2.0" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.404404.product="standalone-browser" \
      io.404404.role="base"
ENV NODE_ENV=production
WORKDIR /opt/browser
COPY package.json package-lock.json ./
COPY LICENSE NOTICE.md /usr/share/doc/browser-worker/
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && cp node_modules/playwright-core/LICENSE /usr/share/doc/browser-worker/playwright-core-LICENSE \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /run/browser-control /run/browser-egress /tmp/browser-sessions \
    && chown -R 10001:10001 /opt/browser /run/browser-control /run/browser-egress /tmp/browser-sessions
COPY src ./src
COPY fixture ./fixture
COPY scripts ./scripts
USER 10001:10001

FROM base AS worker
LABEL io.404404.role="worker"
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R 10001:10001 /opt/browser /run/browser-control /run/browser-egress /tmp/browser-sessions
ENV CHROMIUM_PATH=/usr/bin/chromium \
    BROWSER_CONTROL_SOCKET=/run/browser-control/worker.sock \
    BROWSER_DATA_ROOT=/tmp/browser-sessions
USER 10001:10001
CMD ["node", "src/worker.mjs"]

FROM base AS proxy
LABEL io.404404.role="proxy"
CMD ["node", "src/proxy.mjs"]

FROM base AS gateway
LABEL io.404404.role="gateway"
CMD ["node", "src/gateway.mjs"]

FROM base AS fixture
LABEL io.404404.role="fixture"
CMD ["node", "fixture/server.mjs"]
