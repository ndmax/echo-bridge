# Progress

Plan: milestones M0–M7 (setup → research → bridge skeleton → TTS/zones → login → MP3 (conditional) → Hubitat → packaging/docs).

## Done
- **M0 Setup**: git repo initialized; references cloned (ignored); CLAUDE.md and PROGRESS.md created.
- **M1 Research**: `docs/research.md`, `docs/feasibility.md`, `docs/implementation-plan.md`. TTS + zone = VERIFIED-SOURCE (one `/api/behaviors/preview` POST). MP3 = PLAUSIBLE via `Alexa.Speak` + SSML `<audio>` (third-party hardware reports), UNVERIFIED by us.
- **M2 Bridge skeleton**: `src/config.js`, `errors.js`, `validate.js`, `rate-limit.js`, `server.js` (`/health`, `/devices`, `/speak` against an injected Alexa interface). 16 tests pass (`npm test`, Node v27 alpha).

- **M3 Amazon transport**: `src/alexa.js` (alexa-remote2 8.1.1, pinned). Builds its own `Alexa.Speak` / `AlexaAnnouncement` nodes (configurable locale), sends one `POST /api/behaviors/preview` with library retries disabled. Tests stub `https.request` and assert one outbound request per action (zone included); mutation-checked. 26 tests pass.

- **M4 Login**: `src/login.js` / `npm run login` — alexa-remote2 proxy-only login on the LAN (plain HTTP, 10-minute limit, stops after success), no logger, session saved 0600 in a 0700 dir. Bridge loads it on restart. 31 tests pass; real proxy start/stop tested on loopback without contacting Amazon. Live login on Node 24.22.3 completed in the browser on 2026-11-20 (the first attempt on Node 27 alpha crashed in an alexa-cookie2 dependency; login now refuses Node 27+, `.nvmrc` pins 24). Awaiting CLI output, `/health`, and `data/` permissions to confirm the session was saved and loads.

- **Live checks (2026-11-20, Node 24.22.3)**: login OK; bridge loads the session (`/health` ready); `/devices` worked (filter fixed to drop WHA groups and VOX app entries); **single-device speak VERIFIED-HW** (<1 s, English, no chime); **2-device zone VERIFIED-HW** (one request, played immediately on both).

- **M5 MP3 (bridge side)**: `POST /play {target,url}` → one `Alexa.Speak` with `<speak><audio src="URL"/></speak>` (URL XML-escaped, 250-char SSML limit). Disabled unless `MEDIA_HOST_ALLOWLIST` is set. Response `{accepted:true, verified:false}`. Bridge never fetches the URL. 36 tests pass on Node 24. **MP3 VERIFIED-HW 2026-11-20** (played on one Echo; the first attempts failed only because the bridge wasn't restarted and `MEDIA_HOST_ALLOWLIST` was empty).

- **M6 Hubitat**: `hubitat/echo-bridge-app.groovy` (bridge URL + token, device picker from `/devices`, up to 10 zones of 2-10 Echos, creates/removes children, makes all HTTP calls with `asynchttpPost`) and `hubitat/echo-bridge-device.groovy` (`SpeechSynthesis` `speak`, `playMp3` on single Echos only, `lastResult` attribute). `/play` now returns `{accepted:true}`. Checked: groovyc 2.5 compile + a throwaway stubbed-API harness (23 checks) in Docker; 36 Node tests on Node 24. **Not yet installed on a real hub.**

- **M7 Packaging and docs**: `Dockerfile` (node:24-alpine, non-root, healthcheck, `/app/data` volume), `docker-compose.yml` (Portainer-friendly env interpolation, PUID/PGID, DATA_DIR), `.dockerignore`, `README.md` (network-agnostic HTTPS requirement, NGINX Proxy Manager as the example), `docs/status.md`. Server now handles SIGTERM, reports EADDRINUSE, and sets umask 077. Image built and test container checked locally; 36 tests pass on Node 24; npm audit: 3 low (known).

- **Docker Hub distribution**: `docker-compose.yml` pulls `${ECHO_BRIDGE_IMAGE:-endiemachswell/echo-bridge:latest}` (no `build:`); `.env.example` gains `ECHO_BRIDGE_IMAGE`; Dockerfile has OCI labels; README covers pull-based install/upgrade, Portainer web-editor stack, and a maintainer `buildx` multi-arch (amd64+arm64) push section. Pushed 2026-11-20: `endiemachswell/echo-bridge:0.1.0` + `:latest` (amd64, arm64); pulled image smoke-tested.

- **Login fix (2026-11-21)**: Unraid login failed after the email step (`ERR_SSL_PROTOCOL_ERROR`). Cause: Amazon's `/ax/claim` sends `CSP: upgrade-insecure-requests`. `src/login.js` now strips only that directive in the login process. 38 tests pass. Published 2026-11-21 as `endiemachswell/echo-bridge:0.1.1` + `:latest` (amd64, arm64; manifest `sha256:5bd2333b…`); pulled image checked (Node 24.22.3, fix present). Not yet verified with a real login.

- **0.1.2 (2026-11-21)**: login probes the data folder before starting the proxy, and write errors now name the code, path, and uid/gid. Published `endiemachswell/echo-bridge:0.1.2` + `:latest` (amd64, arm64; `sha256:d2696476…`). The Unraid session wasn't saved because the container couldn't write `DATA_DIR` (host cause pending the user's `id`/mount/`ls -ldn` output).

- **Deployed (2026-11-21)**: user installed 0.1.2 on Unraid behind HTTPS, logged in, installed the Hubitat app and driver; **single-Echo TTS and MP3 played from the hub (VERIFIED-HW)**. Deployment issues were all on the setup side: the CSP upgrade (fixed in 0.1.1), and `PUID`/`PGID` not reaching the container, which left it as 1000:1000 against a root-owned `DATA_DIR` (fixed by the user's settings).

## Next
- Zone `speak` from the hub VERIFIED-HW (2026-11-21); the user tried `playMp3` on a zone and it was refused by design.
- User (optional): one Rule Machine action of each kind.


## Decisions made
- Zones stay speech-only; no zone MP3 research or feature (user, 2026-11-21).
- PROJECT_BRIEF.md wins on MP3: build `/play` only if a real mechanism is proven; UNVERIFIED until heard on an Echo.
- Workspace moved from `scratch/echo-bridge` to `~/Cloud/Tech/Codebase/echo-bridge` (2026-11-21), matching README-SETUP; Claude session history migrated.
- Target Node 24 LTS (`.nvmrc`); use `nvm use` before running. `npm run login` does not work on Node 27.
- Keep both PROGRESS.md (handoff) and docs/status.md (detailed status).
- License: MIT, copyright Nathan Maxwell (`LICENSE`), confirmed by user 2026-11-20.
- README-SETUP's "Run Codex" step skipped (not applicable).
- MP3: build `/play` + `playMp3` labeled UNVERIFIED (user approved 2026-11-20).
- Login proxy: LAN-bound plain HTTP during login is acceptable (user's home network).
- Distribution: Docker image on Docker Hub as `endiemachswell/echo-bridge`, tags `<package version>` + `latest`, multi-arch amd64+arm64 (user, 2026-11-20).
- Repository layout (user, 2026-11-20): agent working files (this file, CLAUDE.md, AGENTS.md, PROJECT_BRIEF.md, START_PROMPT.md, README-SETUP.md) live in `docs/agents/`; commit email is the GitHub no-reply address; GitHub repo `ndmax/echo-bridge`, made public 2026-11-20.
- Single-device TTS uses `Alexa.Speak` (no chime); zones use one announcement (chime).

## Open decisions
- None.
