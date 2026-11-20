# Minimal Echo Bridge — project instructions

Derived from `AGENTS.md` (kept unchanged as the original Codex version). `PROJECT_BRIEF.md` is the source of truth for requirements; if documents conflict, ask the user rather than choosing.

## Mission
Build a **small, readable, maintainable** replacement for the three Echo Speaks capabilities in `PROJECT_BRIEF.md`: individual Alexa text-to-speech, **single-command** announcements to multiple Alexa devices, and playback of a **user-supplied, permanent public HTTPS MP3 URL** on a selected Alexa device.

**Nothing else is in scope.** This is a fresh implementation, not a rewrite of all Echo Speaks features.

## Sources and context
- Read `PROJECT_BRIEF.md` before making architectural decisions.
- `references/` holds read-only clones (`echo-speaks`, `echo-speaks-server`, `echo-speaks-ax-login-patch`, `alexa-remote`). Never modify or commit them.
- Trace each requested feature end-to-end through the original Hubitat apps/drivers, the server/auth proxy, the user's `/ax` login patch, and the speech/zone/media paths.
- Evaluate the latest viable `alexa-remote2` release before writing any auth, discovery, or Amazon transport logic. Inspect installed source; don't assume method signatures. Verify version and maintenance.
- Use authoritative Hubitat and Amazon Alexa docs for claims about supported operations. Distinguish official APIs from unofficial/reverse-engineered behavior.
- Record important claims in `docs/research.md` with source URLs, file paths/line numbers, versions, dates, and confidence levels.
- Respect upstream licenses. Prefer clean original code; preserve required notices if reusing code.

## Non-negotiable scope
1. A Hubitat virtual device sends arbitrary TTS text to exactly one designated Alexa device.
2. A Hubitat virtual zone device sends the **same** text to a user-defined set of Alexa devices using **one** supported multi-target Amazon operation, not N requests. Prove one outbound Amazon operation (a single Hubitat→bridge request is not proof). No silent fallback to N calls, no retry storms.
3. A Hubitat virtual device requests MP3 playback via a **full, permanent, public HTTPS URL**, e.g. `playMp3("https://media.example.com/sounds/doorbell.mp3")`. The bridge passes the URL to a proven Alexa playback mechanism and must **not** retrieve, copy, rehost, proxy, upload, or generate links for audio. Success = audible playback. **Decision (user):** build `/play`/`playMp3` only if research shows a real remote-trigger mechanism; keep it UNVERIFIED until heard on a real Echo; otherwise write a blocker report plus the smallest alternative.

Out of scope: smart-home discovery, switches, routine editor, music controls, temperature, reminders, alarms, dashboards, media browsing, event buses, generalized command frameworks, anything not needed for these three capabilities.

## Preferred shape (reassess only if evidence demands)
- Thin Hubitat Groovy parent app (config, discovery, child creation) and **one reusable Groovy driver** for a single Echo or a named zone.
- Compact Node.js bridge with a small authenticated LAN API wrapping a maintained Alexa library. Plain JavaScript. No frontend frameworks, databases, queues, or extra services.
- Hubitat `SpeechSynthesis` + `speak(text)`. Add `AudioNotification`/`playTrack` only if its commands can be implemented faithfully; don't fake volume/restore/resume. A custom `playMp3(...)` command is fine.
- NGINX Proxy Manager terminates HTTPS; bridge listens on loopback/LAN HTTP. Never require exposing Hubitat admin.
- Target the current Node.js LTS (`engines`, Docker image). The dev machine runs Node v27 alpha; note that in test reports. Simple `npm` workflow; Docker Compose optional.

## MP3 source and networking
- Hosting is solved. Input is a **complete absolute HTTPS URL** — never a filename, `/local/` path, base64, upload, or attachment.
- No media server, URL generator, token signer, proxy/relay, cache, cloud storage, Hubitat File Manager integration, or NPM setup for media.
- AudioPlayer-governed mechanisms require public internet reachability on HTTPS 443 with a publicly trusted cert; check the chosen mechanism's exact format/MIME/bitrate/redirect/range rules.
- A valid URL does not establish a way to initiate playback. If a minimal Skill/routine is needed, document tradeoffs; don't build a broad cloud service.
- Media URLs are public: no secrets in them. The bridge never fetches the URL (no SSRF surface). Validate HTTPS, length, hostname allowlist, no credentials, no unsupported schemes.

## Security
- Never store, echo, commit, or log Amazon passwords, cookies, tokens, sessions, Hubitat tokens, full media URLs, or personal device details. Runtime secrets live in `.env` / ignored files; commit only `.env.example`.
- Prefer `alexa-remote2`'s supported proxy login flow; protect it from unauthorized access. Don't port the patch's CSP/HSTS removal without demonstrated need.
- All bridge endpoints require auth. Validate payloads, allowlisted device IDs, message length, zone size, media URLs.
- Rate limit inbound actions; honor Amazon throttling with conservative backoff. Never evade Amazon limits.
- **Ask first** before: real announcements, triggering playback, Hubitat config changes, deploying containers, authenticating to Amazon, or exposing anything to the network. Offline code, docs, unit tests, and mocks may proceed.

## Work process
- Build one milestone at a time (see `PROGRESS.md` and the approved plan). After each: run code/tests and confirm they work, report briefly what was done and how it was checked, and commit with a clear message.
- Keep `PROGRESS.md` current (done / next / open decisions) so a new session can resume. Keep `docs/status.md` as the detailed status report (implemented/blocked/unverified, test output, user-only steps).
- Don't add features, libraries, or services beyond the docs. `alexa-remote2` is the only planned runtime dependency; use `node:test` for tests. Suggest anything else and let the user decide.
- If a setup step fails or seems outdated, report it rather than working around it quietly.
- When a feature is blocked, keep implementing independently feasible ones; don't expand scope to compensate.

## Style and quality
- Descriptive names, small functions, visible error handling, minimal dependencies, comments about **why**.
- Small documented request/response models. Never convert a zone broadcast into serial calls.
- Tests mock the Amazon transport, assert a single outbound call for multi-device zones, and cover invalid inputs, unauthorized access, rejected HTTP/private/unallowlisted media URLs, and 429 behavior.
- Hubitat Groovy must suit the sandbox: no threads, arbitrary JVM libraries, or Node APIs.
- Don't commit generated artifacts, credentials, or `references/`.
- Be candid about uncertainty and reliance on undocumented Amazon APIs. Leave the user's existing Echo Speaks installation untouched.
