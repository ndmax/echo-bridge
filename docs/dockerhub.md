# Echo Bridge

MIT License.

A small bridge that lets **Hubitat Elevation** make Amazon Echo devices:

1. speak text on one Echo,
2. speak the same text on a zone of Echos with **one** Amazon request,
3. play an MP3 from a public HTTPS URL on one Echo.

Nothing else: no volume, music, routines or smart-home control.

**Source, full setup guide, and the Hubitat app and driver:** https://github.com/ndmax/echo-bridge

> Uses Amazon's unofficial Alexa web API (via [`alexa-remote2`](https://github.com/Apollon77/alexa-remote)), which Amazon may change at any time.

## Quick start

```bash
mkdir -p echo-bridge && cd echo-bridge
curl -fsSLO https://raw.githubusercontent.com/ndmax/echo-bridge/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/ndmax/echo-bridge/main/.env.example
cp .env.example .env    # set BRIDGE_TOKEN, LOGIN_PROXY_IP, DATA_DIR, PUID/PGID
docker compose up -d
docker exec -it echo-bridge node src/login.js   # one-time Amazon sign-in
docker restart echo-bridge
```

Then put the bridge behind HTTPS and install the Hubitat app and driver; see the [README](https://github.com/ndmax/echo-bridge#readme).

## Image details

- **Tags:** `latest`, and version tags such as `0.1.0` (pin one for predictable upgrades).
- **Platforms:** `linux/amd64`, `linux/arm64`.
- **Base:** `node:24-alpine`; runs as a non-root user.
- **Ports:** `3456` bridge API (plain HTTP; put a reverse proxy in front), `3457` login proxy (only while signing in).
- **Volume:** `/app/data` holds the Amazon session. Keep it private.
