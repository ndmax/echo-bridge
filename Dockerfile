# Echo Bridge: small Node.js service; runs as an unprivileged user.
FROM node:24-alpine

LABEL org.opencontainers.image.title="echo-bridge" \
      org.opencontainers.image.description="Minimal Hubitat-to-Alexa bridge: TTS, one-request zone announcements, MP3 URL playback" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3456 \
    COOKIE_FILE=/app/data/alexa-cookie.json \
    LOGIN_PROXY_PORT=3457

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# The Amazon session lives here; mount a volume so it survives container updates.
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3456 3457

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3456) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
