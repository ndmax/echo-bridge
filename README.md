# Echo Bridge

A small, readable bridge that lets **Hubitat Elevation** make Amazon Echo devices:

1. **speak text on one Echo**: `speak("Front door is open")`
2. **speak the same text on a zone of Echos with one Amazon request**: one `speak()` on a zone device
3. **play an MP3 from a public HTTPS URL on one Echo**: `playMp3("https://media.example.com/sounds/doorbell.mp3")`

That's all it does. It is a minimal alternative to [Echo Speaks](https://github.com/tonesto7/echo-speaks) for people who only need these three things. There is no volume control, music, routines, reminders, smart-home control or dashboards.

> **Unofficial API.** The bridge uses the same private Alexa web API as the Alexa app, through the maintained [`alexa-remote2`](https://github.com/Apollon77/alexa-remote) library. Amazon does not document or support it and can change it at any time. MP3 playback in particular relies on undocumented behavior.

## Contents
- [How it works](#how-it-works)
- [Status](#status)
- [Requirements](#requirements)
- [1. Run the bridge](#1-run-the-bridge)
- [2. Sign in to Amazon](#2-sign-in-to-amazon)
- [3. Put the bridge behind HTTPS](#3-put-the-bridge-behind-https)
- [4. Install the Hubitat app and driver](#4-install-the-hubitat-app-and-driver)
- [5. Use it in Rule Machine](#5-use-it-in-rule-machine)
- [MP3 requirements](#mp3-requirements)
- [Bridge API](#bridge-api)
- [Testing without Hubitat](#testing-without-hubitat)
- [Troubleshooting](#troubleshooting)
- [Upgrading](#upgrading)
- [Security notes](#security-notes)
- [Limitations](#limitations)
- [Development](#development)
- [Credits and licenses](#credits-and-licenses)

## How it works

```
Hubitat (Rule Machine, dashboards)
  └─ "Echo Bridge Speaker" virtual device: speak(text) / playMp3(url)
       └─ "Echo Bridge" app ──HTTPS + bearer token──▶ your HTTPS reverse proxy
                                                        └─▶ Echo Bridge (Node.js, HTTP :3456)
                                                              └─ alexa-remote2 ──▶ Amazon ──▶ Echo(s)
```

- Each Hubitat command becomes **exactly one** request to Amazon (`POST /api/behaviors/preview`).
  - **One Echo:** an `Alexa.Speak` command. No chime.
  - **A zone:** **one** announcement listing every Echo in the zone. Amazon delivers it to all of them, with a chime. The bridge never falls back to one request per device, and it never retries.
  - **MP3:** an `Alexa.Speak` command whose text is `<speak><audio src="URL"/></speak>`.
- **The bridge never downloads, proxies or caches audio.** It checks the URL and passes it to Amazon, and the Echo fetches the file itself.
- **Amazon cookies stay on the bridge.** Hubitat only knows the bridge URL and a token.

## Status

Verified on real hardware (2026-11-20 and 2026-11-21, one Amazon US account):

| Feature | Result |
|---|---|
| Speech on one Echo | Spoke in under 1 s, normal voice, no chime |
| Zone (2 Echos, one Amazon request) | Played immediately on both, with chime |
| MP3 from a public HTTPS URL | Played immediately and completely |
| Hubitat app and driver | Installed and tested on a Hubitat hub: speech on one Echo, zone speech, and `playMp3` all played (zone `playMp3` is refused by design) |

Details and sources are in [`docs/feasibility.md`](docs/feasibility.md) and [`docs/status.md`](docs/status.md).

## Requirements

- **Somewhere to run the bridge:** Docker (Compose, Portainer, Unraid and so on) *or* Node.js 24 LTS. Node 27 is **not** supported; see [Troubleshooting](#troubleshooting).
- **An HTTPS endpoint for the bridge that your Hubitat hub can reach,** with a certificate Hubitat trusts, such as Let's Encrypt. Self-signed certificates are not supported. How you provide it is up to you: a reverse proxy (NGINX Proxy Manager, Caddy, Traefik, plain NGINX) or anything else that terminates TLS and forwards to the bridge's HTTP port. An NGINX Proxy Manager example is below.
- **An Amazon account** with Echo devices. You sign in once through a browser; 2FA is supported.
- **For MP3 playback only:** MP3 files at permanent, public HTTPS URLs. See [MP3 requirements](#mp3-requirements). Hosting them is up to you; the bridge doesn't host media.

## 1. Run the bridge

### Option A: Docker Compose / Portainer

The image is published on Docker Hub as [`endiemachswell/echo-bridge`](https://hub.docker.com/r/endiemachswell/echo-bridge) (`linux/amd64` and `linux/arm64`). You don't need the source code or a build step.

1. Download `docker-compose.yml` and `.env.example` into a folder on the Docker host:
   ```bash
   mkdir -p echo-bridge && cd echo-bridge
   curl -fsSLO https://raw.githubusercontent.com/ndmax/echo-bridge/main/docker-compose.yml
   curl -fsSLO https://raw.githubusercontent.com/ndmax/echo-bridge/main/.env.example
   ```
2. Create the settings file:
   ```bash
   cp .env.example .env
   sed -i "s/^BRIDGE_TOKEN=.*/BRIDGE_TOKEN=$(openssl rand -hex 32)/" .env
   chmod 600 .env
   ```
   Then edit `.env`:
   - `LOGIN_PROXY_IP`: the Docker host's LAN IP. Used only during login.
   - `DATA_DIR`: a host folder for the Amazon session, e.g. `/mnt/user/appdata/echo-bridge` on Unraid.
   - `PUID` / `PGID`: the user and group that own `DATA_DIR`. Unraid's defaults are `99` / `100`.
   - Optional: `MEDIA_HOST_ALLOWLIST` (needed for MP3 playback) and `ALLOWED_DEVICE_IDS`.
   - Optional: `ECHO_BRIDGE_IMAGE` to pin a version, e.g. `endiemachswell/echo-bridge:0.1.2`. The default is `:latest`.
3. Create the data folder, owned by that user:
   ```bash
   mkdir -p /mnt/user/appdata/echo-bridge
   chown 99:100 /mnt/user/appdata/echo-bridge && chmod 700 /mnt/user/appdata/echo-bridge
   ```
4. Pull and start:
   ```bash
   docker compose pull
   docker compose up -d
   docker logs echo-bridge     # expect: "Amazon login required ..." until step 2
   ```

**Portainer:** **Stacks → Add stack → Web editor**, paste `docker-compose.yml`, and enter the `.env` values under **Environment variables**. Portainer pulls the image from Docker Hub.

### Option B: Node.js (no Docker)

```bash
nvm use                 # Node 24, from .nvmrc
npm ci --omit=dev
cp .env.example .env    # set BRIDGE_TOKEN as above; set HOST to an address your proxy can reach
chmod 600 .env
npm start
```
Run it under systemd or a similar process manager if it should start on boot.

## 2. Sign in to Amazon

You only need to do this once, and again if the session ever expires. The login uses `alexa-remote2`'s proxy: your browser shows Amazon's own sign-in pages through the bridge, and the bridge saves the resulting session. **Your password goes to Amazon; the bridge never stores or logs it.**

1. Start the login:
   - Docker: `docker exec -it echo-bridge node src/login.js`
   - Node.js: `npm run login`
2. It prints a URL such as `http://192.168.1.20:3457/`. Open **exactly that URL**: the same IP and port, not a hostname, and not through your HTTPS proxy. The login proxy only works on the address it printed.
3. Sign in and complete 2FA. The browser ends on *"Amazon Alexa Cookie successfully retrieved. You can close the browser."*, and the console prints `Login complete …`.
4. Restart the bridge: `docker restart echo-bridge`, or Ctrl-C and `npm start`. The log should say `Amazon session ready`.

The login proxy is plain HTTP on your LAN and runs only while the login command runs; it stops after success or 10 minutes. The session is saved to the data folder with owner-only permissions, and the bridge refreshes it automatically.

## 3. Put the bridge behind HTTPS

**Requirement:** your Hubitat hub must reach the bridge at an `https://` URL with a certificate it trusts, forwarding to the bridge's HTTP port (default `3456`). Only the bridge API needs this. Hubitat itself does not need to be exposed, and the bridge does not need to be reachable from the internet.

### Example: NGINX Proxy Manager

1. **Hosts → Proxy Hosts → Add Proxy Host**
   - *Domain Names:* e.g. `echo-bridge.home.example.com`. It must resolve on your LAN to the proxy, through local DNS or a public DNS record pointing at a private IP.
   - *Scheme:* `http`; *Forward Hostname / IP:* the Docker host's LAN IP (or the container name if NGINX Proxy Manager shares a Docker network with it); *Forward Port:* `3456`.
   - *Block Common Exploits:* on. *Websockets Support:* not needed.
2. **SSL tab:** request a Let's Encrypt certificate. A DNS challenge works for hostnames that aren't reachable from the internet. Enable *Force SSL*.
3. Optional: restrict who can reach it, for example an *Access List* allowing only your Hubitat hub's IP.
4. Test from any machine on your LAN: `curl https://echo-bridge.home.example.com/health` should return `{"ok":true,"amazon":"ready"}`.

> If NGINX Proxy Manager runs in Docker and forwards to `127.0.0.1`, it reaches its own container, not the bridge. Use the host's LAN IP or a shared Docker network instead.

## 4. Install the Hubitat app and driver

1. **Drivers Code → New Driver → Import**, enter this URL → **Import** → **Save**:
   ```
   https://raw.githubusercontent.com/ndmax/echo-bridge/main/hubitat/echo-bridge-device.groovy
   ```
2. **Apps Code → New App → Import**, enter this URL → **Import** → **Save**:
   ```
   https://raw.githubusercontent.com/ndmax/echo-bridge/main/hubitat/echo-bridge-app.groovy
   ```

   *Import* is in the code editor's menu. You can also paste the code from [`hubitat/echo-bridge-device.groovy`](hubitat/echo-bridge-device.groovy) and [`hubitat/echo-bridge-app.groovy`](hubitat/echo-bridge-app.groovy).
3. **Apps → Add User App → Echo Bridge.**
4. Enter the **Bridge URL** (e.g. `https://echo-bridge.home.example.com`) and the **Bridge token** (`BRIDGE_TOKEN` from `.env`).
5. **Choose Echo devices:** the list comes from the bridge. Pick the Echos that should get their own virtual device.
6. **Define speech zones** (optional): give each zone a name and 2–10 Echos.
7. Click **Done**. The app creates devices named `Echo <name>` and `Zone <name>` using the **Echo Bridge Speaker** driver. You can rename them.

On the device page, try **Speak** with some text, or **Play Mp3** with a URL on a single-Echo device. The `lastResult` attribute shows `/speak accepted`, `/play accepted`, or the error.

## 5. Use it in Rule Machine

- **Speak:** use the built-in *Send, Speak or Log a Message → Speak a message* action, or *Custom Action* (capability *Speech Synthesis*), and choose an Echo or Zone device.
  - Example: *Speak on Zone Downstairs: "Garage door has been open for 10 minutes"*.
- **Play an MP3:** *Custom Action* → capability *Actuator* → choose a single-Echo device → command `playMp3` → one **string** parameter with the full URL.
  - Example: `https://media.example.com/sounds/doorbell.mp3`.

Volume and voice options in speech actions are ignored: the Echo uses its current volume and Alexa's voice.

## MP3 requirements

The MP3 is fetched by Amazon, not by the bridge or your hub, so it must be reachable **from the public internet**. These are the rules for Alexa SSML audio; the bridge only enforces the first group.

- **Checked by the bridge:**
  - `https://` on port 443.
  - The hostname is listed in `MEDIA_HOST_ALLOWLIST`. If the list is empty, playback is disabled.
  - No username or password, query string or fragment in the URL.
  - Not an IP address, `localhost`, `.local`, `.lan` or another private name.
  - The path ends in `.mp3`.
  - At most 200 characters.
- **Required by Amazon:**
  - A publicly trusted certificate.
  - MP3 at 48 kbps, 16000 / 22050 / 24000 Hz.
  - At most 240 seconds.
  - Avoid redirects.
  - Convert files with:
    ```bash
    ffmpeg -i input.mp3 -ac 2 -codec:a libmp3lame -b:a 48k -ar 24000 -write_xing 0 output.mp3
    ```
- **Public means public.** Don't use personal audio or URLs containing secrets.

Example input: `playMp3("https://media.example.com/sounds/doorbell.mp3")`.

## Bridge API

All routes except `/health` need `Authorization: Bearer <BRIDGE_TOKEN>`. Bodies are JSON (`Content-Type: application/json`).

| Route | Body | Success |
|---|---|---|
| `GET /health` | – | `{"ok":true,"amazon":"ready"}` or `"login-required"` |
| `GET /devices` | – | `{"devices":[{"id","name","family","online"}]}` (Echos only) |
| `POST /speak` | `{"targets":["<id>", …],"text":"…"}` | `{"accepted":true,"mode":"speak"\|"announcement","targets":n}` |
| `POST /play` | `{"target":"<id>","url":"https://…/file.mp3"}` | `{"accepted":true}` |

**`accepted` means Amazon accepted the request.** Amazon gives no confirmation that the Echo actually spoke or played.

Limits (configurable in `.env`):
- text: 250 characters, no `<` or `>`
- zones: 2–10 Echos
- rate: about 6 actions per minute, burst 3
- after Amazon throttles a request: a 60 s pause, during which requests get `429` with `Retry-After`

## Testing without Hubitat

```bash
TOKEN=$(grep ^BRIDGE_TOKEN= .env | cut -d= -f2)
BRIDGE=http://localhost:3456      # or your https:// URL
curl -s -H "Authorization: Bearer $TOKEN" $BRIDGE/devices
curl -s -X POST $BRIDGE/speak -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"targets":["<echo id>"],"text":"Hello from Echo Bridge"}'
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 unauthorized` | Wrong or missing token. Check the Bridge token in the Hubitat app, or the `Authorization` header. |
| `503 amazon_not_ready` / `/health` says `login-required` | No saved session. Run the login (step 2), then restart the bridge. |
| `503 amazon_auth_failed` | The Amazon session expired and couldn't be refreshed. Run the login again. |
| `429 rate_limited` | Bridge rate limit. Slow down, or raise `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_BURST`. |
| `429 amazon_throttled` | Amazon is throttling. The bridge pauses for `THROTTLE_COOLDOWN_SECONDS` and does not retry. Don't send bursts. |
| `502 amazon_rejected` / `amazon_unreachable` | Amazon refused the request, or couldn't be reached. Check the bridge logs and try again later. |
| `400 unknown_device` | The Echo ID isn't on the signed-in account. Re-open *Choose Echo devices* in the app. |
| `403 playback_disabled` | Set `MEDIA_HOST_ALLOWLIST` and restart the bridge. |
| `403 host_not_allowed` | The URL's hostname doesn't exactly match `MEDIA_HOST_ALLOWLIST` (watch for `www.`). |
| `404 not_found` on `/play` | An older bridge is still running. Restart it, and check nothing else holds the port. |
| MP3 accepted but silent, or Alexa says there was a problem | The file or URL doesn't meet the [MP3 requirements](#mp3-requirements). Re-encode, and check the URL from outside your network. |
| Login page never loads / `ERR_CONNECTION_REFUSED` | Use exactly the URL the login printed. Make sure port 3457 is reachable (published in Docker, open in the host firewall). On Node 27 the login proxy crashes; use Node 24 or Docker. |
| After entering your email: `ERR_SSL_PROTOCOL_ERROR` / *sent an invalid response* on `https://<IP>:3457` | Fixed in the current image: update it (`docker compose pull && docker compose up -d`) and run the login again. Older images passed on an Amazon header that switched the browser to HTTPS. |
| Login: `cannot write to /app/data…` or `could not write COOKIE_FILE`; data folder stays empty | The container user (`PUID`:`PGID`) can't write the host `DATA_DIR`. Check that `DATA_DIR` is the folder you think it is, then `chown <PUID>:<PGID>` it (step 1) and recreate the container. |
| Login redirects to an Amazon error, or loops | Start the login again in a private browser window. Check `AMAZON_PAGE` matches your Amazon region (e.g. `amazon.co.uk`). |
| Hubitat: *Could not load devices from the bridge* | Hubitat can't reach the HTTPS URL, the certificate isn't trusted, or the token is wrong. Test with `curl` from another machine first. |
| `port 3456 is already in use` | Another bridge (or another program) is running. Stop it first. |

## Upgrading

- **Docker:** `docker compose pull && docker compose up -d`. In Portainer, use the stack's **Update** with *Re-pull image* on. If you pinned `ECHO_BRIDGE_IMAGE` to a version, change the tag first.
- **Node.js:** `git pull && npm ci --omit=dev`, then restart.

Your session in the data folder is kept either way. To upgrade the Hubitat code, open the driver and the app under *Drivers Code* / *Apps Code*, use **Import** again with the same URLs, **Save**, then click **Done** in the Echo Bridge app.

## Security notes

- **Bridge access:** every route except `/health` requires the bearer token. Inputs are strictly validated, and request bodies, message text and media URLs are never logged.
- **Amazon session files:** they live in the data folder with owner-only permissions. Treat that folder like a password: anyone holding the session can control your Alexa account. There is no API for reading the session back out.
- **Login proxy:** it is plain HTTP on the LAN, only while the login runs. Use it on a network you trust.
- **Port exposure:** keep port 3456 on your LAN, and preferably reachable only from your reverse proxy. Hubitat should use the HTTPS URL.

## Limitations

- **Unofficial API:** it uses Amazon's private, undocumented Alexa API, which may break without notice.
- **No delivery confirmation:** "accepted" doesn't prove an Echo was audible.
- **Zones are approximately simultaneous, not synchronized.** Each zone always uses an announcement with a chime. Zones support `speak` only.
- **Not supported:** volume, voice selection, restore/resume, music, multi-room groups, or anything else.
- **MP3 is limited:** a single Echo only, 240 seconds or less, and it depends on the file meeting Amazon's audio rules.
- **Tested setup:** tested with one Amazon US account. Other regions should work with `AMAZON_PAGE`/`ALEXA_LOCALE` but are untested.

## Development

```bash
nvm use && npm ci
npm test        # node:test; Amazon is mocked at the https.request level
```
The tests prove what the bridge sends, for example exactly one outbound Amazon request for a zone. They can't prove what Amazon or an Echo does. Research notes, design and status are in [`docs/`](docs/).

### Publishing the image (maintainer)

Build for both common architectures and push to Docker Hub, tagged with the `package.json` version and `latest`:
```bash
npm test                                   # on Node 24
VERSION=$(node -p "require('./package.json').version")
docker login                               # once, as endiemachswell
# On an x86 machine, register the arm64 (QEMU) emulator. It lasts until reboot.
# Check with `docker buildx ls`: the builder's platforms should include linux/arm64.
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx create --use --name echo-bridge-builder 2>/dev/null || docker buildx use echo-bridge-builder
docker buildx build --platform linux/amd64,linux/arm64 \
  -t endiemachswell/echo-bridge:$VERSION -t endiemachswell/echo-bridge:latest --push .
```
Optional cleanup afterwards:
```bash
docker buildx rm echo-bridge-builder
docker rmi moby/buildkit:buildx-stable-1
docker run --privileged --rm tonistiigi/binfmt --uninstall qemu-aarch64
docker rmi tonistiigi/binfmt:latest
```
Bump `version` in `package.json` before each release so every published tag is unique. `.dockerignore` keeps `.env`, `data/` and `references/` out of the image; never build from a folder where secrets could slip past it.

The Docker Hub overview is kept in [`docs/dockerhub.md`](docs/dockerhub.md). After changing it, paste it into the repository's overview on Docker Hub. The short description is: *Minimal Hubitat-to-Alexa bridge: Echo TTS, one-request zone announcements, MP3 URL playback*.

To test a local build without pushing, run `docker build -t echo-bridge:local .` and set `ECHO_BRIDGE_IMAGE=echo-bridge:local` in `.env`.

## Credits and licenses

Echo Bridge is released under the [MIT License](LICENSE). Copyright (c) 2026 Nathan Maxwell.


- [`alexa-remote2`](https://github.com/Apollon77/alexa-remote) and `alexa-cookie2` by Apollon77 and contributors (MIT) do the Amazon work.
- The design was informed by [Echo Speaks](https://github.com/tonesto7/echo-speaks) (Apache-2.0) and [echo-speaks-server](https://github.com/tonesto7/echo-speaks-server) (MIT). No code was copied from them.
- The MP3 approach was informed by reports from Home Assistant's Alexa Media Player community.
