# Feasibility

Sources and line references are in [research.md](research.md). Status vocabulary:
- **VERIFIED-SOURCE**: the mechanism is shown in library source.
- **VERIFIED-HW**: heard on a real Echo by us.
- **PLAUSIBLE**: third-party hardware reports, not our hardware.
- **UNVERIFIED**: untested.
- **BLOCKED**: no viable mechanism.

Real-device tests are run by the user. Individual TTS and the 2-device zone are VERIFIED-HW as of 2026-11-20; MP3 is pending.

## Feature / transport matrix

| Feature | Candidate mechanism | Evidence | Mock test | Real device test | Status |
|---|---|---|---|---|---|
| Individual TTS | One `POST /api/behaviors/preview` with an `Alexa.Speak` node (skill `amzn1.ask.1p.saysomething`), one target | alexa-remote2 `speak` builder (`alexa-remote.js:2843-2885`); Echo Speaks `speak()` uses the same family | M3: one outbound POST with the expected node (`test/alexa.test.js`) | 2026-11-20: Office Echo spoke the text in under 1 s, normal English voice, no chime; bridge returned `{"accepted":true,"mode":"speak","targets":1}` | **VERIFIED-HW** |
| Multi-device TTS (one call) | One `POST /api/behaviors/preview` with **one** `AlexaAnnouncement` node whose `target.devices` lists every Echo | alexa-remote2 array branch (`alexa-remote.js:2925-2980`, README "multiple devices using one command"); Echo Speaks zones use the same (`echo-speaks-zones.groovy:1384-1390`) | M3: exactly one outbound POST containing all serials; no per-device fallback on error/429 (`test/alexa.test.js`, mutation-checked) | 2026-11-20: one `/speak` with 2 Echos → `{"accepted":true,"mode":"announcement","targets":2}`; played immediately on both | **VERIFIED-HW** (one request in tests; delivery to both on hardware) |
| Public HTTPS MP3 URL on Echo | One `POST /api/behaviors/preview` with an `Alexa.Speak` node whose `textToSpeak` is `<speak><audio src="URL"/></speak>`, one target | Same payload as Home Assistant AMP "tts" (alexapy `alexaapi.py:1076-1137`); real-Echo success reported in supernotify PR #224 (2026-09-25) and AMP #1412; the announcement variant reported **not** to play audio | M5: URL validation; one outbound POST with SSML `<audio>`; media host never contacted (`test/play.test.js`, `test/validate.test.js`) | Pending (user, with a public MP3) | PLAUSIBLE: **UNVERIFIED until heard** |

## Answers to the brief's questions

**1. Working and deprecated Echo Speaks paths.**
- Speech and announcements post sequences to `/api/behaviors/preview` directly from Hubitat. These paths still work, but they depend on Echo Speaks' login server, which needed the `/ax` patch.
- Zones send one multi-device announcement by default. They loop `speak()` per device when "force announce" is off.
- `playTrack(url)` never played URLs. It turns the file name into an Amazon Music CLOUDPLAYER search phrase, and that service has been discontinued. Treat it as dead.

**2. Login with alexa-remote2 today.**
- **Status: PLAUSIBLE.** alexa-cookie2 5.0.6 (Aug 2026) runs its login proxy at root, so Amazon's `/ax/...` URLs work without the patch's HTML rewriting or CSP/HSTS stripping. Its recent releases fix exactly this flow and 2FA redirects.
- 2FA is completed on Amazon's own (proxied) page. The cookie and refresh data are saved to an ignored file with mode 0600, and the library refreshes them automatically. When refresh fails, you redo the proxy login.
- **Limitation:** the library's proxy hard-codes `http://ip:port`, so it can't sit behind NGINX Proxy Manager's HTTPS. The safe option is to bind it to `127.0.0.1` only during login and reach it through an SSH tunnel. That is encrypted and never exposed on the LAN.

**3. Does a zone produce one Amazon call?**
- **From source: yes.** One `POST /api/behaviors/preview` carries one `AlexaAnnouncement` node with every device in `target.devices`. Amazon then fans it out server-side.
- **Extra requests:**
  - an auth-check `GET` at most every 30 minutes. This is not a speech operation.
  - the library's own single retry on 503/throttling. We disable this with `isRetry: true`.
- **Pitfalls we handle:** the library silently drops unknown serials, and it hard-codes the `de-DE` locale. The bridge validates targets itself and builds its own node with a configurable locale.
- **Behavior:** announcements play a chime first and show text on screen devices.
- **Eligibility:** Echo devices with announcement support. Exact eligibility is unknown, so you choose the devices.
- **Sync:** playback is approximately simultaneous, not synchronized.
- **Rate limits:** unpublished. We keep a conservative inbound limit, cool down after throttling, and never retry per device.

**4. Can the bridge start a URL playing solely from a Hubitat command?**
- **Probably, through an undocumented path.** `Alexa.Speak` with SSML `<audio>` is the same payload Home Assistant users report working on real Echos in 2026. It needs no skill, routine, or voice invocation for each clip.
- The official mechanisms (AudioPlayer, SSML in skill responses) require a custom skill's response. They can't be triggered remotely by a third party without building and hosting a skill. That is out of scope unless the undocumented path fails.
- Smallest fallback if it fails: a Voice Monkey "trigger" (their skill), called with the URL, or a single user-created Alexa routine. Both are documented options, not built.

**5. URL, TLS, and format rules** (Amazon SSML `<audio>` rules, assumed to apply):
- public internet HTTPS with a publicly trusted certificate (no self-signed), port 443
- MP3 at 48 kbps, sample rate 16000, 22050 or 24000 Hz; mono or stereo
- at most 240 s
- recommended conversion: `ffmpeg -i in.mp3 -ac 2 -codec:a libmp3lame -b:a 48k -ar 24000 -write_xing 0 out.mp3`
- `textToSpeak` is capped at 250 characters, so the URL must be ≤ about 210 characters after XML escaping
- avoid redirects (unverified whether Amazon follows them)
- no skill or routine is needed if the undocumented path works

**6. MP3 without voice invocation or a routine per file.** Yes, if item 4 holds: each call passes a new URL.

**7. Minimum safe architecture.**
- Hubitat driver → (HTTPS via NGINX Proxy Manager, bearer token) → Node bridge → alexa-remote2 → Amazon.
- Hubitat never holds Amazon cookies. The bridge never fetches media.
- What can't be shown without you: login, audible speech, zone simultaneity and chime behavior, MP3 playback, throttle thresholds, and which device families are eligible.

**8. Licensing.**
- alexa-remote2, alexa-cookie2 and the ax patch are MIT. echo-speaks-server is MIT. Echo Speaks is Apache-2.0.
- We depend on alexa-remote2 as an npm package (MIT notice ships with it). We write our own Groovy and JS, copying no upstream code, so no extra attribution is required. We credit the projects in the README anyway.

## Decision needed / flagged
- **MP3:** proceed with `/play` and `playMp3`, clearly labeled **UNVERIFIED**, because the mechanism exists in source (the same `Alexa.Speak` payload) and has independent hardware reports. If the live test fails, remove or disable the endpoint and document Voice Monkey or a routine as the fallback.
- **Login access:** use an SSH tunnel to a loopback-only proxy (recommended), or LAN-bound plain HTTP for the few minutes of login.
