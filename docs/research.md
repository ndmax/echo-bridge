# Research notes

Date: 2026-11-20. Reference clones (read-only, `references/`, not committed):

| Repo | Commit | Commit date | License |
|---|---|---|---|
| tonesto7/echo-speaks | `0d81528` | 2026-11-01 | Apache-2.0 (file headers, e.g. `apps/echo-speaks.groovy:8`) |
| tonesto7/echo-speaks-server | `1d1d63a` | 2022-11-28 (unmaintained) | MIT (`package.json:59`) |
| ndmax/echo-speaks-ax-login-patch | `232a2e0` | 2026-10-25 | MIT (`LICENSE`) |
| Apollon77/alexa-remote (npm `alexa-remote2`) | `f97a934` | 2026-08-15 | MIT |

Confidence legend: **H** = read directly in source/official docs; **M** = third-party report or indirect evidence; **L** = inference.

**Outcome (2026-11-20/21, one Amazon US account):** all three mechanisms below were confirmed on real Echos, both directly against the bridge and from a Hubitat hub. Single-device speech and MP3 used one `Alexa.Speak` node; the 2-Echo zone used one `AlexaAnnouncement` node in one request. All three still depend on Amazon's undocumented Alexa app API. Current per-feature status is in [`status.md`](status.md).

The rest of this file is the research as written before building. Statements such as "not verified by us" describe that point in time; corrections found later are marked with their date.

## 1. alexa-remote2 (the library we will wrap)

- **Version/maintenance (H).** npm `alexa-remote2@8.1.1`, published 2026-08-15, MIT, `engines.node >=16`. It depends on `alexa-cookie2@5.0.6` (also 2026-08-15, MIT). Recent changelog entries are login fixes: 8.0.5 "Fix Amazon login proxy auth flow" (2026-07-05) and 8.1.1 "Alexa-Cookie fixes for 2FA and redirects during Logins" (`references/alexa-remote/README.md:46-56`). The library is actively maintained (it is the ioBroker Alexa adapter's backend).
- **Dependency audit (H).** A fresh install reports 3 *low* advisories, all through `cookie <0.7.0` (GHSA-pxg6-pf52-xh8x), which comes in via alexa-cookie2's proxy stack. The affected code only runs in the login proxy. Accepted risk, documented here.
- **All Amazon commands go through one POST (H).** `sendSequenceCommand` builds `{behaviorId:'PREVIEW', sequenceJson, status:'ENABLED'}` and calls `httpsGet('/api/behaviors/preview', …, {method:'POST'})` exactly once (`alexa-remote.js:3029-3077`). This is an **unofficial, reverse-engineered** endpoint: the Alexa app's "routine preview".
- **Single-device speech (H).** Command `speak` → node type `Alexa.Speak`, skill `amzn1.ask.1p.saysomething`, `operationPayload.textToSpeak = value`. It enforces a **250-character limit** and collapses repeated spaces. On non-`.com` Amazon domains it rewrites `1.5` to `1,5` (`alexa-remote.js:2843-2885`).
- **Multi-device announcement (H).** Commands `announcement`/`ssml` → node type `AlexaAnnouncement`, skill `amzn1.ask.1p.routines.messaging`, `expireAfter: 'PT5S'`, `content[0].speak = {type:'text'|'ssml', value}`. When `serialOrName` is an **array**, it builds **one** node whose `target.devices` lists every device (`alexa-remote.js:2925-2980`). The README changelog confirms: "enhance announce/ssml to allow send to multiple devices using one command" (`README.md:432`). Pitfalls:
  - Unknown serials are **silently dropped** (`if (!currDevice) return;`, `alexa-remote.js:2971-2973`). The bridge must validate the targets itself.
  - Locale is hard-coded to `de-DE` in `content[0].locale` and in the `ALEXA_CURRENT_LOCALE` replacement (`alexa-remote.js:2949`, `3072`). Echo Speaks sends the user's region locale (`en-US` default, `apps/echo-speaks.groovy:4359`). **Decision:** the bridge builds its own sequence node with a configurable locale and passes it as an object. `sendSequenceCommand` accepts an object (`command.sequence || command`, `alexa-remote.js:3043-3045`).
- **Transport behavior (H).** `httpsGetCall` (`alexa-remote.js:1228-1340`):
  - 401 → error.
  - 503 → one retry after 0.5–1 s.
  - Body containing `ThrottlingException`/`Rate exceeded`/`Too many requests` → **one retry after 10–60 s**.
  - Empty 2xx body → `{success:true}`.
  - **A non-2xx response with a JSON body is returned as a success value**, so the status code is lost.

  Setting `flags.isRetry = true` disables both automatic retries. **Decision:** the bridge calls `httpsGet` directly with `isRetry: true`, so throttling surfaces immediately as an HTTP 429 to Hubitat instead of a stale announcement 60 s later. It treats any response other than `{success:true}` as failure.
- **Auth checks (H).** `httpsGet` performs `checkAuthentication` (an extra GET) if more than 30 min have passed since the last check (`alexa-remote.js:1180-1212`). That is a session check, not a speech operation; tests and docs count "Amazon speech operations" as POSTs to `/api/behaviors/preview`.
- **Device list (H).** `getDevices` → `GET /api/devices-v2/device?cached=true` (`alexa-remote.js:1460`). Devices carry `serialNumber`, `deviceType`, `deviceOwnerCustomerId`, `accountName`, `deviceFamily`, `capabilities`, `online`.
- **No URL playback API (H).** alexa-remote2 has no command that takes a media URL. Its media paths are music-provider *search phrases* (`playMusicProvider`, `alexa-remote.js:3140`), Audible, TuneIn, built-in `Alexa.Sound` sound IDs (`:2689`), and player transport controls (`/api/np/command`, `:2555`).
- **Logging hazard (H).** With a `logger` option, alexa-cookie2's proxy logs full request headers, including cookies (`proxy.js` router: `` `Router: ${url} / ${req.method} / ${JSON.stringify(req.headers)}` ``), and alexa-remote logs full responses. **Decision:** never pass the library a raw logger. Pass none, or one that drops messages.

## 2. Login: alexa-cookie2 proxy vs the user's `/ax` patch

- **Echo Speaks' failure (H).** echo-speaks-server bundles an old fork of alexa-cookie (`libs/alexa-cookie/lib/proxy.js`, 367 lines) mounted under `/proxy`. Amazon's identifier-first sign-in posts to root-relative URLs (`/ax/claim`), which escape the `/proxy` mount. The patch (`echo-speaks-ax-login-patch/README.md`):
  1. strips Amazon's `content-security-policy` and `strict-transport-security` headers;
  2. rewrites root-relative `action/href/src` attributes into the proxy path;
  3. adds 307 redirects for `/ax`, `/ap`, `/cvf`, `/aaut`, `/gp`.
- **Patch security tradeoff (H/L).** Removing CSP weakens Amazon's protection against script injection on the login page while the user types their password through the proxy. Removing HSTS is mostly moot because the proxy is plain HTTP anyway. Both were needed only because of the sub-path mount.
- **Current alexa-cookie2 (H).** Its standalone proxy listens on its **own port at the root path**. It routes unknown root-relative paths using the referer's Amazon host or a default Amazon host (`proxy.js` `router()` and `rewriteProxyPath()`, about lines 225-300). So `/ax/...` works without HTML rewriting or header stripping, and 5.0.4–5.0.6 (Jul–Aug 2026) contain upstream fixes for exactly this flow. **Conclusion:** don't port the patch. Use `alexa-cookie2` via alexa-remote2's `proxyOnly` flow (M, until a real login is done).
- **Correction, 2026-11-21 (H): one header still has to go.** The first real login (Docker on Unraid) failed right after the email step with `ERR_SSL_PROTOCOL_ERROR` from `https://<LOGIN_PROXY_IP>:3457`. Amazon's `/ax/claim` page sends `content-security-policy: upgrade-insecure-requests;report-uri https://metrics.media-amazon.com/` (checked with `curl -D -` on 2026-11-21). The rest of its policy is `content-security-policy-report-only`. alexa-cookie2 5.0.6 passes the header through (`proxy.js` `onProxyRes`, ~line 425, never touches CSP), so the browser upgrades the form post to HTTPS on the plain-HTTP proxy. **Fix:** `src/login.js` `stripUpgradeInsecureRequests()` drops only that directive while http-proxy writes headers (`http-proxy` 1.18.1 `web-incoming.js:173-177`: `proxyRes` event, then `web-outgoing` `writeHeaders` → `res.setHeader`). This is narrower than the patch: no other CSP directive is enforced, so nothing is lost, and HSTS stays because browsers ignore it over HTTP and for IP hosts. The HTML rewriting and redirect parts of the patch are still unnecessary. The 2026-11-20 dev login missed this because it used `LOGIN_PROXY_IP=127.0.0.1`, which browsers treat as a secure origin and (M) don't upgrade.
- **Proxy constraints (H).**
  - `proxyBase()` hard-codes `http://${proxyOwnIp}:${proxyPort}/`.
  - The router matches the `Host` header literally against `${proxyOwnIp}:${proxyPort}`.

  So the login proxy **cannot simply sit behind NGINX Proxy Manager on a different hostname/port with HTTPS**. Options:
  - (a) Bind it to `127.0.0.1` and reach it through an SSH tunnel (`ssh -L 3457:127.0.0.1:3457 host`). This is encrypted and never LAN-exposed. Recommended.
  - (b) Bind it to the LAN IP for the few minutes of login. Plain HTTP on the LAN; the password crosses the LAN unencrypted.

  Either way it runs **only on demand** and shuts down after cookies are captured. The password goes through the proxy process memory (unavoidable with any proxy login), but our code never reads, stores or logs it.
- **Re-auth/2FA (H/M).** Amazon 2FA happens in the proxied Amazon page. Afterwards `cookieData` (including `formerRegistrationData`, refresh token, `macDms`) is reused for automatic cookie refresh (`cookieRefreshInterval`, example default 7 days; `example/example.js:39-43`). When refresh fails, the user repeats the proxy login.
- **alexa-cookie2 quirks found while building `npm run login` (H, `node_modules/alexa-cookie2/lib/proxy.js:116-180`).**
  - The proxy writes device-registration data (`deviceId`, `frc`, `map-md`) to `formerDataStorePath`, which defaults to a file inside `node_modules`. Write errors are silently ignored. The bridge points it at the data dir and creates that dir (0700) before starting the proxy.
  - When it reads that data back, it uses the *default* path, not `formerDataStorePath` (line 121). So with a custom path, each fresh proxy login registers a new device ID with Amazon. That is harmless, but it is noted here.
  - The default login page language is `de_DE` (`alexa-cookie.js` `amazonPageProxyLanguage`). The bridge sets it from `ALEXA_LOCALE`.
  - Starting the proxy makes no outbound requests. Amazon is contacted only when a browser loads the proxy URL (verified in `test/login.test.js`).
- **Node 27 incompatibility (H, found in the first live login on 2026-11-20).** alexa-cookie2 5.0.6 depends on `http-proxy-response-rewrite@0.0.1` (last published 2022). Its `index.js:16` calls `zlib.Gunzip()` without `new`. Node 24.22.3 allows this with a DEP0184 warning; Node 27.0.0-alpha throws `Class constructor Gunzip cannot be invoked without 'new'` on the first gzip response from Amazon. That crashes the proxy, and the browser then gets ERR_CONNECTION_REFUSED. Mitigations: `.nvmrc` pins Node 24, and `npm run login` refuses to start on Node 27+. Revisit when alexa-cookie2 replaces that dependency.
- **echo-speaks-server API security (H, informative).** `GET /cookieData` returns the stored cookie session **without authentication** (`echo-speaks-server/index.js:150-153`). Our bridge must not repeat this: no cookie read-back endpoint at all.

## 3. Echo Speaks code paths (Hubitat side)

- **Hubitat calls Amazon directly.** The Echo Speaks parent app posts sequences to `${amazonUrl}/api/behaviors/preview` itself (`apps/echo-speaks.groovy:3916-3929`). The server is used for login and cookie refresh. Our design moves Amazon calls into the bridge, so Hubitat never holds Amazon cookies.
- **Single-device `speak()`** → `speechCmd` → an `Alexa.Speak`-style sequence (`drivers/echo-speaks-device.groovy:2759-2780`).
- **Zone `speak()`** → `zoneCmdHandler` (`apps/echo-speaks-zones.groovy:1328`). By default (`forceAnnounce` true) it converts speak into an announcement and calls `zoneDevs[0].sendAnnouncementToDevices(msg, title, devObj)`, commented "We send the list of devices to announce one and then Amazon does all the processing" (`:1384-1390`). That builds **one** `AlexaAnnouncement` with `target.devices = devObj` (`apps/echo-speaks.groovy:4344-4372`). With `forceAnnounce` off it **loops `dev.speak()` per device** (`apps/echo-speaks-zones.groovy:1376-1380`). That is the N-call path we must not copy. Setting a volume also adds one volume node per device inside the same sequence.
- **`playTrack(uri)` does not play URLs.** `drivers/echo-speaks-device.groovy:1302-1311` calls `uriTrackParser(uri)`. That function takes the text after the last `/`, lowercases it, turns `_` into spaces and strips `.mp3` (`:2690-2699`). It then runs `Alexa.Music.PlaySearchPhrase` with provider `CLOUDPLAYER` (`:1990-2007`), i.e. it asks Amazon Music to *search for a song called "doorbell"*. CLOUDPLAYER was Amazon's music-upload locker, which Amazon discontinued. **This path is effectively dead and was never URL playback.** (H)
- **Hubitat capabilities** used by Echo Speaks: `SpeechSynthesis`, `AudioNotification`, `Notification`, `AudioVolume` (`drivers/echo-speaks-device.groovy:57-63`). Hubitat's docs page (https://docs2.hubitat.com/en/developer/driver/capability-list) renders client-side and could not be fetched as text, so command signatures are from established Hubitat usage (M):
  - `SpeechSynthesis`: `speak(text)` (newer firmware: `speak(text, volume, voice)`).
  - `AudioNotification`: `playText`, `playTextAndRestore`, `playTextAndResume`, `playTrack`, `playTrackAndRestore`, `playTrackAndResume`, all with optional volume.

  We cannot honor restore/resume/volume. **Decision:** declare `SpeechSynthesis` only, plus a custom `playMp3(url)` command, not `AudioNotification`.

## 4. MP3 playback from a URL

- **Official mechanisms (H, Amazon docs).**
  - **AudioPlayer `Play` directive.** Only a *custom skill's response* can issue it, and its stream must be HTTPS on port 443 with a trusted certificate (https://developer.amazon.com/en-US/docs/alexa/custom-skills/audioplayer-interface-reference.html, updated 2024-09-06; long-form page updated 2025-12-09).
  - **SSML `<audio src>` in skill speech.** It needs an "Internet-accessible HTTPS endpoint" with no self-signed certificates, MP3 at 48 kbps and 16000/22050/24000 Hz, at most 240 s total and at most five clips per response (https://developer.amazon.com/en-US/docs/alexa/custom-skills/speech-synthesis-markup-language-ssml-reference.html, updated 2025-08-28; requirements quoted via fetch summary, M).

  Neither is offered to third parties as a remote "play this URL now" API.
- **Unofficial path: `Alexa.Speak` with SSML `<audio>` (M).**
  - Home Assistant's Alexa Media Player sends "tts" as a sequence node `Alexa.Speak`, `skillId amzn1.ask.1p.saysomething`, `textToSpeak=message` (alexapy 1.36.0 `alexaapi.py:1076-1137`, inspected from the PyPI wheel). That is the **same node** alexa-remote2's `speak` builds.
  - Supernotify PR #224 (merged 2026-09-25, https://github.com/rhizomatics/supernotify/pull/224) reports a real-Echo test: `<speak><audio src="…mp3"/>message</speak>` with "type tts … plays the clip", while the "announce" type "played nothing for the SSML <audio> tag". The file was a 2 s 48 kbps/24 kHz MP3.
  - AMP issue #1412 (2021–2024, https://github.com/alandtse/alexa_media_player/issues/1412) has a user confirming tts-type playback after re-encoding with `ffmpeg -ac 2 -codec:a libmp3lame -b:a 48k -ar 24000 -write_xing 0`.
  - node-red alexa-remote2 issue #18 (2021) confirms `<audio>` is ignored in the announcement/routine node.

  **Conclusion:** the plausible mechanism is `Alexa.Speak` with `textToSpeak = <speak><audio src="URL"/></speak>` to **one** device. It is undocumented, not verified by us, and capped at **250 characters including the SSML wrapper**, so URLs must be ≤ about 220 characters. The MP3 should follow the SSML `<audio>` format rules above.

  **Result (2026-11-20, H on our hardware):** `/play` to one Echo with the user's ffmpeg-converted (48 kbps, 24 kHz) MP3, hosted on their own public HTTPS domain, played immediately and completely. Confirmed again from the Hubitat hub on 2026-11-21. Zones stay speech-only: there is no proven single-request multi-Echo MP3 mechanism (announcements ignore `<audio>`).
- **Fallback if Amazon breaks this path (not built).** A Voice Monkey "trigger" called with the URL, or one user-created Alexa routine. The official mechanisms need a custom skill, which is out of scope.
- **Voice Monkey (H, https://voicemonkey.io/docs/media).** It requires a public HTTPS URL, MP3/MP4 at 44.1/48 kHz, at most 240 s (longer only via its "Long audio" node). It is a separate skill-based service; its success says nothing about the unofficial preview endpoint.

## 5. Rate limits and latency

- Amazon publishes no limits for `/api/behaviors/preview` (unofficial). The evidence is the library's own handling of `ThrottlingException` / `Rate exceeded` / `Too many requests` bodies (H, `alexa-remote.js:1261-1290`). Treat limits as unknown and stay conservative: a small inbound token bucket plus a cooldown after any throttle response (L).
- Announcement fan-out to several devices happens inside Amazon after one request. Playback start is **approximately simultaneous, not sample-synchronized**; any skew is not under our control (L; verify on hardware).
- Delivery status: `/api/behaviors/preview` returns an empty 2xx on acceptance. That proves Amazon *accepted* the sequence, **not** that any device spoke (H, from the response handling).

## 6. Node.js LTS

Per nodejs.org release pages (searched 2026-11-20), Node 24 moved to Maintenance LTS on 2026-10-20, and Node 26 is the newest LTS line (M; confirm at https://nodejs.org/en/about/previous-releases before release). Target: `engines: ">=24"`, Docker `node:24-alpine` (supported until 2028-04-30). Optionally bump to 26. The dev machine runs v27.0.0-alpha, which is non-LTS, so local test results carry that caveat.
