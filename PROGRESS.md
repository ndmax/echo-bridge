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

## Next
- **M6 Hubitat**: parent app + one driver (`speak`, `playMp3`).

## Decisions made
- PROJECT_BRIEF.md wins on MP3: build `/play` only if a real mechanism is proven; UNVERIFIED until heard on an Echo.
- Workspace stays at `scratch/echo-bridge` (README-SETUP path is outdated).
- Target Node 24 LTS (`.nvmrc`); use `nvm use` before running. `npm run login` does not work on Node 27.
- Keep both PROGRESS.md (handoff) and docs/status.md (detailed status).
- README-SETUP's "Run Codex" step skipped (not applicable).
- MP3: build `/play` + `playMp3` labeled UNVERIFIED (user approved 2026-11-20).
- Login proxy: LAN-bound plain HTTP during login is acceptable (user's home network).
- Single-device TTS uses `Alexa.Speak` (no chime); zones use one announcement (chime).

## Open decisions
- None.
