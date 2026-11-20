# Progress

Plan: milestones M0–M7 (setup → research → bridge skeleton → TTS/zones → login → MP3 (conditional) → Hubitat → packaging/docs).

## Done
- **M0 Setup**: git repo initialized; references cloned (ignored); CLAUDE.md and PROGRESS.md created.
- **M1 Research**: `docs/research.md`, `docs/feasibility.md`, `docs/implementation-plan.md`. TTS + zone = VERIFIED-SOURCE (one `/api/behaviors/preview` POST). MP3 = PLAUSIBLE via `Alexa.Speak` + SSML `<audio>` (third-party hardware reports), UNVERIFIED by us.
- **M2 Bridge skeleton**: `src/config.js`, `errors.js`, `validate.js`, `rate-limit.js`, `server.js` (`/health`, `/devices`, `/speak` against an injected Alexa interface). 16 tests pass (`npm test`, Node v27 alpha).

- **M3 Amazon transport**: `src/alexa.js` (alexa-remote2 8.1.1, pinned). Builds its own `Alexa.Speak` / `AlexaAnnouncement` nodes (configurable locale), sends one `POST /api/behaviors/preview` with library retries disabled. Tests stub `https.request` and assert one outbound request per action (zone included); mutation-checked. 26 tests pass.

## Next
- **M4 Login**: `npm run login` using alexa-cookie2's proxy on the LAN; save session to `COOKIE_FILE` (0600).

## Decisions made
- PROJECT_BRIEF.md wins on MP3: build `/play` only if a real mechanism is proven; UNVERIFIED until heard on an Echo.
- Workspace stays at `scratch/echo-bridge` (README-SETUP path is outdated).
- Target current Node LTS; local dev is Node v27 alpha.
- Keep both PROGRESS.md (handoff) and docs/status.md (detailed status).
- README-SETUP's "Run Codex" step skipped (not applicable).
- MP3: build `/play` + `playMp3` labeled UNVERIFIED (user approved 2026-11-20).
- Login proxy: LAN-bound plain HTTP during login is acceptable (user's home network).
- Single-device TTS uses `Alexa.Speak` (no chime); zones use one announcement (chime).

## Open decisions
- None.
