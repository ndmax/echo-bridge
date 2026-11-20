# Progress

Plan: milestones M0–M7 (setup → research → bridge skeleton → TTS/zones → login → MP3 (conditional) → Hubitat → packaging/docs).

## Done
- **M0 Setup**: git repo initialized; references cloned (ignored); CLAUDE.md and PROGRESS.md created.

## Next
- **M1 Research**: trace upstream code, evaluate alexa-remote2, write `docs/research.md`, `docs/feasibility.md`, `docs/implementation-plan.md`. Ends with the MP3 verdict.

## Decisions made
- PROJECT_BRIEF.md wins on MP3: build `/play` only if a real mechanism is proven; UNVERIFIED until heard on an Echo.
- Workspace stays at `scratch/echo-bridge` (README-SETUP path is outdated).
- Target current Node LTS; local dev is Node v27 alpha.
- Keep both PROGRESS.md (handoff) and docs/status.md (detailed status).
- README-SETUP's "Run Codex" step skipped (not applicable).

## Open decisions
- None yet.
