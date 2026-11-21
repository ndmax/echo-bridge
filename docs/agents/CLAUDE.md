# Echo Bridge — project instructions

Echo Bridge is released and in maintenance (0.1.2, deployed 2026-11-21). `PROJECT_BRIEF.md` is the original scope document; if documents conflict, ask the user rather than choosing. Current state: `../status.md`. Evidence for every Amazon behavior we rely on: `../research.md`. Decisions: `PROGRESS.md`.

## Scope
Exactly three capabilities, all VERIFIED-HW:
1. A Hubitat device speaks arbitrary text on one Echo (`speak` → one `Alexa.Speak`).
2. A Hubitat zone device speaks the same text on several Echos with **one** outbound Amazon request (one `AlexaAnnouncement` listing every target). Never convert a zone into per-device calls, add a silent fallback to N calls, or retry in a loop.
3. A single-Echo Hubitat device plays a **full, permanent, public HTTPS MP3 URL** (`playMp3` → one `Alexa.Speak` with SSML `<audio>`). Zones stay speech-only (user decision).

Out of scope: smart-home control, volume, voices, restore/resume, music, routines, reminders, alarms, dashboards, media browsing, event buses, generalized command frameworks, and anything else not needed for these three.

## MP3 rules
- Input is a complete absolute HTTPS URL, never a filename, path, base64, upload or attachment.
- The bridge never fetches, copies, proxies, hosts, signs or generates media URLs. No media server, cache or storage.
- Validate: HTTPS only, length, hostname in `MEDIA_HOST_ALLOWLIST`, no credentials, no IP/local hosts.

## Security
- Never store, echo, commit or log Amazon passwords, cookies, tokens, sessions, the bridge token, full media URLs, or personal device details. Secrets live in `.env` / `data/` (ignored); commit only `.env.example`.
- All bridge endpoints except `/health` require the bearer token. Validate payloads, device IDs, message length, zone size and media URLs.
- Rate-limit inbound actions and honor Amazon throttling with a conservative cooldown. Never evade Amazon limits.
- **Ask first** before: real announcements, triggering playback, Hubitat config changes, deploying or publishing containers, authenticating to Amazon, or exposing anything to the network. Offline code, docs, unit tests and mocks may proceed.
- Leave the user's existing Echo Speaks installation untouched. `references/` (if present) holds read-only upstream clones; never modify or commit them.

## Working on changes
- Plain JavaScript on Node 24 LTS (`.nvmrc`). This machine has only Node 27 alpha; run the suite on Node 24 too (`docker run --rm --network none -v "$PWD":/app:ro -w /app node:24-alpine npm test`) and say which versions were used.
- `alexa-remote2` (pinned) is the only runtime dependency; tests use `node:test`. Suggest any other library or service and let the user decide.
- Before changing Amazon transport or login code, inspect the installed library source; don't assume method signatures. Record new findings about Amazon or library behavior in `../research.md` with sources and confidence.
- Tests mock Amazon at `https.request`, assert a single outbound call for zones, and cover invalid input, unauthorized access, rejected media URLs and 429 behavior.
- Hubitat Groovy must suit the sandbox: no threads, JVM libraries or Node APIs.
- After a change: run the tests, report briefly what changed and how it was checked, update `../status.md` (and `PROGRESS.md` for decisions), and commit with a clear message.
- Releases: bump `version` in `package.json`; publishing steps are in the README's maintainer section and `../dockerhub.md`.
- If a setup step fails or seems outdated, report it rather than working around it quietly.

## Style
- Small, readable and maintainable: descriptive names, small functions, visible error handling, comments about **why**.
- Be candid about uncertainty and about reliance on undocumented Amazon APIs.
