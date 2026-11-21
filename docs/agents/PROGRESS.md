# Progress

Initial release 0.1.2 (2026-11-21) is deployed and all three features work from Hubitat. Feature status, test results and maintainer notes are in [`../status.md`](../status.md); build history is in git.

## Decisions made
- Zones stay speech-only; no zone MP3 research or feature (user, 2026-11-21).
- MP3: `/play` + `playMp3` on a single Echo, built because a real mechanism was proven (`Alexa.Speak` with SSML `<audio>`, verified on hardware 2026-11-20). It relies on undocumented Amazon behavior.
- Single-device TTS uses `Alexa.Speak` (no chime); zones use one announcement (chime).
- Target Node 24 LTS (`.nvmrc`). `npm run login` does not work on Node 27.
- Login proxy: LAN-bound plain HTTP during login is acceptable (user's home network).
- Distribution: Docker image on Docker Hub as `endiemachswell/echo-bridge`, tags `<package version>` + `latest`, multi-arch amd64+arm64 (user, 2026-11-20).
- License: MIT, copyright Nathan Maxwell (`LICENSE`), confirmed by user 2026-11-20.
- Repository layout (user, 2026-11-20): agent working files live in `docs/agents/`; commit email is the GitHub no-reply address; GitHub repo `ndmax/echo-bridge`, public since 2026-11-20.
- Docs after release (user, 2026-11-21): build-phase files (start prompt, workspace setup, Codex instructions, implementation plan, feasibility) removed; `research.md` keeps the evidence, `status.md` the current state.

## Next
- Optional user checks: see `../status.md`.

## Open decisions
- None.
