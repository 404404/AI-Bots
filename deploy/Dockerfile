ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS build
ENV CI=1 PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /opt/app
RUN npm install --global pnpm@12.4.2
COPY . .
RUN pnpm install --frozen-lockfile --filter botharness --filter './packages/**' \
 && pnpm build
ADD --checksum=sha256:59d7d027ad0f24410e88e0cf239a04f8e724de400b5c418fab259f3b5c285ff1 https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.31.0/cua-driver-rs-0.31.0-linux-x86_64-binary.tar.gz /tmp/cua-driver.tar.gz
RUN mkdir -p /opt/cua-driver/0.31.0/linux-x86_64 \
 && tar -xzf /tmp/cua-driver.tar.gz -C /opt/cua-driver/0.31.0/linux-x86_64 \
 && printf '%s  %s\n' b59170779e14c08ef9e69c545bd4c6d7a31781fad421c668374d83cdd6721b98 /opt/cua-driver/0.31.0/linux-x86_64/cua-driver | sha256sum -c - \
 && chmod 0555 /opt/cua-driver/0.31.0/linux-x86_64/cua-driver \
 && rm /tmp/cua-driver.tar.gz
# Runtime UID 10001 copies this seed into persistent DSH Home; it only needs read access.
RUN mkdir -p /opt/dsh-seed \
 && DSH_HOME=/opt/dsh-seed node deploy/prepare-gui-profile.mjs \
 && DSH_HOME=/opt/dsh-seed pnpm --dir /opt/dsh-seed/profiles/gui install \
 && chmod -R a+rX /opt/dsh-seed/profiles

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    DSH_HOME=/data/dsh \
    DISPLAY=:99 \
    XDG_CURRENT_DESKTOP=Openbox \
    DESKTOP_SESSION=openbox \
    HOME=/data/dsh/runtime-home \
    PATH=/opt/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LABEL org.opencontainers.image.title="DeepSeekBot Linux GUI" \
      org.opencontainers.image.source="https://github.com/404404/AI-Bots" \
      org.opencontainers.image.licenses="MIT" \
      io.botharness.runtime="dsh-linux-gui" \
      io.botharness.profile="gui"
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends --only-upgrade perl-base \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    at-spi2-core ca-certificates chromium chromium-sandbox dbus dbus-x11 fonts-dejavu-core \
    fonts-noto-color-emoji fonts-noto-cjk libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 libxss1 libxtst6 \
    curl openbox tini x11-utils xauth xvfb iproute2 util-linux \
 && npm install --global --ignore-scripts --no-audit --no-fund npm@12.2.1 \
 && npm --version | grep -Fx '12.2.1' \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/dsh \
 && groupadd --gid 10001 dsh \
 && useradd --uid 10001 --gid 10001 --create-home --home-dir /data/dsh/runtime-home \
      --shell /usr/sbin/nologin dsh \
 && chown -R 10001:10001 /data/dsh \
 && chmod 1777 /tmp
WORKDIR /opt/app
COPY --from=build --chown=0:0 /opt/app/node_modules /opt/app/node_modules
COPY --from=build --chown=0:0 /opt/app/packages/client /opt/app/packages/client
COPY --from=build --chown=0:0 /opt/app/packages/core /opt/app/packages/core
COPY --from=build --chown=0:0 /opt/app/packages/computer /opt/app/packages/computer
COPY --from=build --chown=0:0 /opt/app/packages/browser /opt/app/packages/browser
COPY --from=build --chown=0:0 /opt/app/packages/deepseekbot /opt/app/packages/deepseekbot
COPY --from=build --chown=0:0 /opt/app/scripts/dev-profile.mjs /opt/app/scripts/dev-profile.mjs
COPY --from=build --chown=0:0 /opt/app/scripts/e2e-cli-readonly.mjs /opt/app/scripts/e2e-cli-readonly.mjs
COPY --from=build --chown=0:0 /opt/app/deploy /opt/app/deploy
COPY --from=build --chown=0:0 /opt/dsh-seed/profiles /opt/dsh-seed/profiles
COPY --from=build --chown=0:0 /opt/cua-driver /opt/cua-driver
COPY --chown=0:0 deploy/container-entrypoint.mjs deploy/container-healthcheck.mjs deploy/gui-profile.patch.yml /opt/app/deploy/
RUN rm -rf \
    /opt/app/node_modules/.pnpm/@typescript+typescript-linux-x64@* \
    /opt/app/node_modules/.pnpm/typescript@* \
    /opt/app/node_modules/.pnpm/node_modules/@typescript/typescript-linux-x64 \
    /opt/app/node_modules/.pnpm/node_modules/typescript \
    /opt/app/node_modules/@typescript/typescript-linux-x64 \
    /opt/app/node_modules/typescript \
 && chmod -R a-w /opt/app \
 && chmod 0555 /opt/app/deploy/container-entrypoint.mjs /opt/app/deploy/container-healthcheck.mjs
USER 10001:10001
EXPOSE 3080 1455
VOLUME ["/data/dsh"]
HEALTHCHECK --interval=30s --timeout=8s --start-period=90s --retries=3 \
  CMD ["node", "/opt/app/deploy/container-healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/app/deploy/container-entrypoint.mjs"]
