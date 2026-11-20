# Progress

Plan: milestones M0–M7 (setup → research → bridge skeleton → TTS/zones → login → MP3 (conditional) → Hubitat → packaging/docs).

## Done
- **M0 Setup**: git repo initialized; references cloned (ignored); CLAUDE.md and PROGRESS.md created.
- **M1 Research**: `docs/research.md`, `docs/feasibility.md`, `docs/implementation-plan.md`. TTS + zone = VERIFIED-SOURCE (one `/api/behaviors/preview` POST). MP3 = PLAUSIBLE via `Alexa.Speak` + SSML `<audio>` (third-party hardware reports), UNVERIFIED by us.

## Next
- **M2 Bridge skeleton**: config, auth, validation, limiter, `/health`, tests.

## Decisions made
- PROJECT_BRIEF.md wins on MP3: build `/play` only if a real mechanism is proven; UNVERIFIED until heard on an Echo.
- Workspace stays at `scratch/echo-bridge` (README-SETUP path is outdated).
- Target current Node LTS; local dev is Node v27 alpha.
- Keep both PROGRESS.md (handoff) and docs/status.md (detailed status).
- README-SETUP's "Run Codex" step skipped (not applicable).

## Open decisions
- MP3: proceed with `/play` labeled UNVERIFIED (recommended in feasibility.md) — awaiting user OK.
- Login proxy access: SSH tunnel to loopback (recommended) vs LAN-bound HTTP during login.
- Single-device TTS uses `Alexa.Speak` (no chime); zones use announcement (chime).
