# Project brief — Minimal Echo Bridge

## Goal
Create a **simple, human-readable replacement** for the three Echo Speaks functions that matter to this user. Do **not** modernize or reproduce the rest of the original system.

### Priority 1 — Single-device speech
From Hubitat (including Rule Machine), select a virtual Alexa device and call `speak("Front door is open")`. The associated physical Echo must audibly speak the supplied text. Demonstrate what Amazon API/sequence is used, what voice/announcement mode it supports, and what delivery/error status can actually be observed. It is fine to use announcement mode where necessary; document any audible chime or behavioral differences.

### Priority 2 — Multi-device speech via ONE Amazon request
The user may define a zone such as `Downstairs = [Kitchen, Living Room, Office]` and invoke a **single Hubitat virtual zone** with one `speak(text)` call. The bridge must send **one supported Amazon multi-target announcement operation** for that set, not fire off one per-device call. Investigate `alexa-remote2` multi-device `announcement`/`ssml` support and verify the current payload. Explain whether this yields exact synchronization or only approximate simultaneity. Never silently fall back to individual sends, including under retries or partial failure. Be explicit about Apple/Amazon rate-limit restrictions and deliverability.

### Priority 3 — Play an MP3 from a supplied public HTTPS URL
The user **already can host permanent, publicly accessible MP3 files over HTTPS**. The new integration must accept a complete audio URL, for example `playMp3("https://media.example.com/sounds/doorbell.mp3")` (or Hubitat `playTrack(url)` where faithfully supported), and attempt to start playing that file on a selected Echo device. The URL might point to a Hubitat File Manager file exposed through the user's own reverse proxy, but this is **not** a requirement or something this project must configure. Media hosting is out of scope.

The new code must **not** upload, cache, copy, retrieve, host, relay, or re-serve MP3 files, generate signed/temporary links, build `/local/` paths, or add a media upload UI. An HTTPS URL is the complete media input. Implement the smallest possible validation and pass-through to the *proven* Alexa playback mechanism. Investigate whether the Alexa library can remotely initiate playback from an arbitrary URL; **do not assume Echo Speaks' broken `playTrack` path still works**. Compare documented AudioPlayer/SSML/skill mechanisms, noting that some require an activated skill or routine. Voice Monkey is evidence that its skill-backed system can consume a public URL; it does **not** prove that an unofficial Alexa remote endpoint can trigger it.

**Acceptance is audible playback on a real Echo after a Hubitat command, without manual voice invocation for each clip.** Public HTTPS availability removes a hosting obstacle, not the Alexa command/invocation obstacle. If a standalone skill/routine or third-party service is unavoidable, document the exact constraints and smallest viable option. Keep the app truthful about unsupported paths instead of returning misleading success.

## Environment and preferences
- Hubitat Elevation appliance; applications and drivers are Groovy.
- External service can run as a small Node.js app or Docker container on a Linux host. Provide an easy deployment path compatible with Portainer/Docker Compose, but do not make Docker mandatory.
- User already has **NGINX Proxy Manager**, can provide HTTPS at a local hostname for Hubitat and the bridge, and **can readily provide a permanent, publicly reachable HTTPS URL for any MP3**. Treat external media hosting as a solved prerequisite. Do not publish the Hubitat admin interface or include media hosting/proxy work in this project.
- Security is preferred over bypassing modern browser requirements. HTTPS for login is welcome.
- User wants **few files, little boilerplate, readable code, no frontend framework, and no unnecessary dependencies**.
- New app must operate independently of the existing Echo Speaks deployment; no destructive migration.

## Upstream references — analyze deeply, DO NOT install or modify
1. https://github.com/tonesto7/echo-speaks
   - Inspect Hubitat parent app, relevant device driver, zone app, zone driver, `speak`, `playTrack`, and message-dispatch paths.
   - Identify the smallest required public Hubitat commands and how Rule Machine would call them.
2. https://github.com/tonesto7/echo-speaks-server
   - Inspect Amazon authentication, cookies, server, device discovery, speech requests, zones, media URL handling, API security, and dependencies. Trace which pieces are obsolete.
3. https://github.com/ndmax/echo-speaks-ax-login-patch
   - User's existing patch for the Amazon identifier-first `/ax` sign-in change. Explain the failure, patch behavior, and security tradeoffs. Do not copy deprecated logic unnecessarily.
4. https://github.com/Apollon77/alexa-remote
   - Evaluate latest viable `alexa-remote2`, its login flow, multi-device command implementation, rate-limit handling, and support (or lack of support) for arbitrary MP3 URL playback. Check current source rather than guessing method signatures.
5. Official Hubitat developer documentation: https://docs2.hubitat.com/en/developer/overview and https://docs2.hubitat.com/en/developer/driver/capability-list
6. Alexa AudioPlayer media requirements: https://developer.amazon.com/en-US/docs/alexa/custom-skills/use-long-form-audio.html
7. Voice Monkey's public documentation of media requirements: https://voicemonkey.io/docs/media and https://voicemonkey.io/docs

## Specific research questions to answer in `docs/feasibility.md`
- What are the **actual** working and deprecated Echo Speaks code paths for speech, zones, and media?
- Is Amazon account login available with `alexa-remote2` under current Amazon sign-in? What safe authentication approach works, including re-authentication/2FA?
- Does `alexa-remote2` create one real Amazon announcement API call for a set of serial numbers? Is there a separate endpoint or per-device behavior under the hood? What are the supported modes, recipient device eligibility, rate limits, and latency?
- Given a **working permanent public HTTPS MP3 URL**, can the bridge start playback on a chosen Echo **solely** from a Hubitat command through a current remote API? If not, why?
- What exact URL, TLS, audio-format, and accessibility rules apply to the chosen playback mechanism? Given the already-public URL, is an Alexa skill/routine or another invocation integration still required?
- Can the selected approach play MP3 without the user verbally invoking a skill or manually creating a different routine for every file?
- What is the minimum safe architecture, and what cannot be demonstrated without user-controlled live Alexa/Hubitat testing?
- Which upstream code is legally reusable and under what license/attribution requirements?

## Recommended tiny interface (adjust only with evidence)
### LAN bridge routes
- `GET /health` — health without revealing secrets.
- `GET /devices` — authenticated minimal list of Alexa speakers with stable IDs and friendly labels.
- `POST /speak` — authenticated JSON, e.g. `{ "targets": ["echo-device-id"], "text": "Hello" }`. For a zone, `targets` contains multiple device IDs and maps to **one** outbound Amazon multi-recipient operation. Return only verifiable request status.
- `POST /play` — authenticated JSON, e.g. `{ "target": "echo-device-id", "url": "https://media.example.com/sounds/doorbell.mp3" }`, **only if a mechanism for actually triggering playback is feasible**. The server passes the URL into the chosen operation without fetching or proxying the media. Otherwise document why it is not implemented; do not create a misleading endpoint.

### Hubitat
- One parent app managing bridge URL, API token, speaker selection, and named zones.
- One small reusable driver for either a single speaker or a speech zone, using stored device/zone metadata; support `SpeechSynthesis`/`speak` and `playMp3(String httpsUrl)` or compatible `playTrack(httpsUrl)` if genuinely supported. Do not require an MP3 filename, upload, or local filesystem path.
- Use asynchronous Hubitat HTTP methods where suitable. Validate data and handle failures without blocking the hub.
- Do not implement volume management, restoring previous media, screen functionality, real-time status, discovery outside necessary Alexa speakers, device control beyond speech, or additional Echo Speaks features.

## Phases and acceptance gates

### Phase 0: Repository research
Examine references deeply. Write `docs/research.md`, `docs/feasibility.md`, and `docs/implementation-plan.md`. Include a matrix:

| Feature | Candidate mechanism | Evidence | Mock test | Real device test | Status |
|---|---|---|---|---|---|
| Individual TTS | ... | ... | ... | ... | ... |
| Multi-device TTS (one call) | ... | ... | ... | ... | ... |
| Public HTTPS MP3 URL on Echo | ... | ... | ... | ... | ... |

Distinguish **verified from source code**, **verified with real hardware**, **probable**, and **blocked**. Don't conflate them.

### Phase 1: Proof-of-concept
Create small transport abstraction and focused tests. For group speech, assert one outbound request containing all recipients. Investigate playback thoroughly; when blocked, write the minimal alternative design without inventing a successful implementation. Do not access real Amazon/Hubitat accounts without authorization.

### Phase 2: Build minimum feasible bridge
Implement only validated operations; add secure configuration, input validation, clear errors, minimal logging, package scripts, Dockerfile/compose only if they help.

### Phase 3: Build Hubitat layer
Implement parent app + small driver. Simple setup: bridge hostname and token, enumerate eligible speakers, choose virtual child devices, define named speech zones. Include cut-and-paste Groovy installation instructions and Rule Machine usage examples.

### Phase 4: Test and document
Run local unit/mock tests and produce manual verification checklist for real devices. Document HTTPS for the bridge/login only, a **sample public MP3 URL** and its requirements (without instructing the user to build a media server), login procedure, installation, upgrade, and common Amazon errors (`401`, `429`, login redirect failures). Update `docs/status.md` honestly.

## What counts as done
- Readable, maintainable source tree with a few focused files and minimal third-party dependencies.
- Research and feasibility deliverables grounded in source citations and actual implementation code, not general statements.
- A working or explicitly real-device-unverified individual TTS path.
- A **one-Amazon-call** group speech path with automated call-count tests.
- `playMp3(httpsUrl)` / `POST /play` with a permanent public HTTPS URL implemented **only if remotely triggered playback is technically validated**; otherwise a clear blocker report and minimally intrusive alternative. No media serving, retrieval, upload, or proxy code.
- README includes straightforward deployment, HTTPS proxy setup, Hubitat setup, sample virtual-device calls, testing, and limitations.
- No stored credentials in Git; no real side effects on existing Echo Speaks, Hubitat, or Amazon account without user approval.
