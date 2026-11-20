# Codex repository instructions — Minimal Echo Bridge

## Mission
Build a **small, readable, maintainable** replacement for the three Echo Speaks capabilities described in `PROJECT_BRIEF.md`: individual Alexa text-to-speech, **single-command** announcements to multiple Alexa devices, and playback of a **user-supplied, permanent public HTTPS MP3 URL** on a selected Alexa device.

**Nothing else is in scope.** This is a fresh implementation, not a rewrite of all Echo Speaks features.

## Sources and context
- Read `PROJECT_BRIEF.md` before making architectural decisions.
- Analyze the checked-out repositories under `references/` as **read-only reference material**: `echo-speaks`, `echo-speaks-server`, `echo-speaks-ax-login-patch`, and `alexa-remote`.
- Study original Hubitat parent/child apps, device and zone drivers, the server/auth proxy, the user's `/ax` login patch, and original speech/zone/media paths. Trace each requested feature end-to-end.
- Evaluate the latest viable `alexa-remote2` release before writing any authentication, device-discovery, or Amazon transport logic from scratch. Do not assume APIs or library methods are current; inspect installed source and docs. Verify current versions and maintenance.
- Consult authoritative Hubitat developer documentation and Amazon Alexa documentation for any claims about supported operations. Distinguish official APIs from unofficial/reverse-engineered behavior.
- Document important claims in `docs/research.md` with source URLs, source-file paths/line references, versions, dates, and confidence levels.
- Respect the licenses of upstream projects. Prefer clean, original implementation rather than wholesale copying. Preserve required copyright notices and attribution if reusing licensed code.

## Non-negotiable scope
1. A Hubitat virtual speaker/device can send arbitrary TTS text to exactly one designated Alexa device.
2. A Hubitat virtual zone/device can send the **same** text to a user-defined set of Alexa devices, using one supported multi-target Amazon API operation, not N separate requests. An HTTP request from Hubitat to the bridge is not proof of one outbound Amazon operation: prove the latter. Do not silently fall back to N calls or add retry storms.
3. A Hubitat virtual device can request MP3 playback on a chosen Alexa device by passing the **full, permanent, public HTTPS URL** of an existing MP3 file, e.g. `playMp3("https://media.example.com/sounds/doorbell.mp3")`. The bridge passes the URL to a proven Alexa playback mechanism; it must **not** retrieve, copy, rehost, proxy, upload, or generate links for audio. Make actual audible playback the success criterion. Confirm the triggering mechanism before claiming support.

No smart-home discovery, switches, routine editor, music controls, temperature, reminders, alarms, dashboards, media browsing, elaborate event buses, generalized command frameworks, or feature-complete Echo Speaks clone. Do not add any feature not needed for these three capabilities.

## Preferred shape (reassess only if evidence demands)
- Thin Hubitat Groovy parent app for configuration/discovery and child creation, and **one reusable Groovy virtual device driver** representing either a single Echo or a named multi-Echo speech zone.
- Compact Node.js bridge exposing a small authenticated LAN API, wrapping a maintained Alexa library. Plain JavaScript is preferred unless TypeScript adds demonstrable clarity. Avoid frontend frameworks, persistent databases, queues, and services without a demonstrated requirement.
- Hubitat `SpeechSynthesis` capability and a direct `speak(text)` command; add `AudioNotification` / `playTrack(...)` only if its declared commands can be implemented faithfully. If volume/restore/resume features cannot be honored, do not pretend they work. A custom `playMp3(...)` command is acceptable where needed.
- Existing NGINX Proxy Manager can terminate HTTPS. Bridge may listen on loopback/LAN HTTP behind it. HTTPS should be used for login and authenticated endpoints. Never require exposed Hubitat administration access.
- Backend runs on a supported Node.js LTS version; provide simple `npm` development and Docker Compose deployment instructions, keeping Docker optional.

## MP3 source and networking
- **Assume hosting is solved.** The user can serve permanent public HTTPS MP3 links, including files originally stored on Hubitat if they choose. The MP3 playback command takes a **complete absolute URL**; never a filename, Hubitat `/local/` path, base64 audio, upload, or file attachment.
- Example input: `https://media.example.com/sounds/doorbell.mp3`. The user's media hostname is configured externally; the bridge should not require knowing how the file is hosted. No built-in media server, URL generator, token signer, proxy/relay, temporary caching, cloud storage, Hubitat File Manager integration, or NGINX Proxy Manager setup for media is in scope.
- For playback mechanisms governed by the Alexa AudioPlayer rules, the remote media must be reachable from Amazon/Echo over the **public internet on HTTPS port 443** with a publicly trusted certificate; LAN-only DNS/HTTPS does not meet that requirement. Check the exact chosen playback mechanism's requirements (including actual MP3 content, MIME type, redirects, formats, bit rates, and range behavior where relevant).
- Investigate whether a direct command from Hubitat via the bridge can **cause the Echo to start playing that supplied URL**, including whether `alexa-remote2` offers an effective remote command. A valid URL is necessary for many audio interfaces but **does not establish a way to initiate playback**. If a minimal Alexa Skill/routine is necessary, document the invocation and setup tradeoffs; do not introduce a broad cloud service or feature set without compelling evidence.
- If direct initiated playback cannot be proven, clearly mark feature 3 **UNVERIFIED/BLOCKED**, and provide the smallest credible alternative. A successful HTTP response, functioning media URL, or Voice Monkey's separate skill-based ability to play audio is not evidence that this bridge can start playback.
- Media links are **public and permanent**, so they must contain no personal/sensitive audio, embedded credentials, access tokens, or secret query parameters. The bridge should not fetch the URL server-side (avoid SSRF entirely). Validate HTTPS, reasonable length, allowed hostnames or a configurable hostname allowlist, and disallow credentials/unsupported schemes. If a future implementation truly needs a fetch, review redirects and public-vs-private IPs first; do not add fetching speculatively.

## Security
- Never store, echo, commit, or log Amazon passwords, cookies, tokens, browser sessions, Hubitat tokens, full media URLs, or personal device details. Use `.env`/ignored local files for runtime secrets.
- Implement a real browser-based login flow only if necessary, and prefer the maintained library's supported proxy flow. Login handling must avoid credential capture by our own code where possible. Protect the local login proxy from unauthorized access; HTTPS + restricted access are preferred.
- Do not blindly port the user's patch's CSP/HSTS removal into new code. Understand why it was needed for the legacy proxy; avoid it if the maintained login implementation works correctly.
- Bridge endpoints require authentication. Validate payloads and allowlisted device IDs, bound message lengths, zone sizes, and HTTPS MP3 URLs (including hostname allowlists). Do not download media or follow media redirects unless a documented playback mechanism truly requires it. Prevent URL injection, CSRF where relevant, and credential leaks in errors.
- Rate limit inbound actions and honor Amazon throttling with conservative backoff. **Never** evade Amazon rate limits with account switching, floods, or rotating proxies.
- Do not send real announcements, trigger playback, change Hubitat configuration, deploy containers, or authenticate to Amazon without explicit user authorization. Offline code, docs, unit tests, and mock integration tests may proceed autonomously.

## Work process
1. **Research**: Trace upstream code and architecture. Create `docs/research.md`, `docs/feasibility.md`, and `docs/implementation-plan.md`, with a short feature/transport matrix indicating VERIFIED, PLAUSIBLE, UNVERIFIED, or BLOCKED. Identify current library and license issues.
2. **Proof of concept**: Build narrowly focused mocked tests for TTS, multi-target announcement, and MP3 playback interface. Separate real-device smoke tests needing user participation. Do not pretend mocks verify Amazon behavior.
3. **Minimal implementation**: Build only necessary bridge/Hubitat components for feasible features. Keep the architecture compact. Where possible, make group announcement one outbound Amazon API call and assert that fact in tests.
4. **Validation**: Run local tests, static checks, and dependency/security review. Describe manual installation, NGINX Proxy Manager configuration, Amazon login, device mapping, Rule Machine usage, and actual-device testing.
5. **Report**: Update `docs/status.md` with implemented/blocked/unverified items, test output, outstanding user-only steps, and concrete next actions.

Work through research, plan, offline implementation, and tests without waiting for routine permission. Stop for requests needing credentials, live device tests, network exposure, production changes, or a genuinely fundamental architecture decision. When a feature is blocked, keep implementing independently feasible features; do not expand scope to compensate.

## Style and quality
- Favor descriptive names, small functions, visible error handling, minimal dependencies, and comments about **why**, not obvious **what**.
- Keep API request/response models small and documented; never silently convert a zone broadcast into serial calls.
- Mock the Amazon transport in tests, including assertion of a single outbound call for a multi-device zone. Test invalid inputs, unauthorized access, rejected HTTP/private/unallowlisted media URLs, and API 429 behavior.
- Use readable, portable Groovy suited to Hubitat's sandbox. Do not assume ordinary JVM libraries, threads, or Node APIs are available in Hubitat.
- Do not commit generated artifacts, credentials, or the `references/` repositories. Create meaningful Git checkpoints before major phases if possible; do not rewrite upstream references.
- Be candid about uncertainty and dependencies on undocumented Amazon APIs. The user's existing Echo Speaks installation should remain untouched during development.
