# Status

Last updated: 2026-11-20.

## Feature status

| Feature | Implementation | Automated tests | Real hardware | Status |
|---|---|---|---|---|
| Single-Echo TTS | `POST /speak` → one `Alexa.Speak` | `test/alexa.test.js`, `test/server.test.js` | Spoke in under 1 s, normal English voice, no chime | **VERIFIED-HW** |
| Zone TTS, one Amazon request | `POST /speak` with 2+ targets → one `AlexaAnnouncement` listing all devices | One outbound `https.request` with every recipient; no retry or per-device fallback on 429/401/503/400. Mutation-checked: a per-device loop and re-enabled library retries both fail the tests | 2 Echos played immediately, one request | **VERIFIED-HW** |
| MP3 from a public HTTPS URL | `POST /play` → one `Alexa.Speak` with `<speak><audio src="URL"/></speak>` | `test/play.test.js`, `test/validate.test.js`: URL rules, XML escaping, 250-char limit, media host never contacted | User's 48 kbps / 24 kHz MP3 played immediately and completely | **VERIFIED-HW** (undocumented Amazon behavior) |
| Amazon login | `npm run login` / `docker exec … node src/login.js` (alexa-cookie2 proxy) | `test/login.test.js`: options, file permissions, failure path, real proxy start/stop with no Amazon traffic | Completed with 2FA on Node 24.22.3; crashed on Node 27 alpha (dependency bug, now guarded) | **VERIFIED-HW** |
| Hubitat app + driver | `hubitat/*.groovy` | groovyc 2.5 compile; throwaway stubbed-API harness (23 checks: one request per zone, local rejections, child sync, error reporting, no token or URL logging) | Not installed yet | **UNVERIFIED on a hub** |
| Docker packaging | `Dockerfile`, `docker-compose.yml` | Image built; test container: `/health` OK, Docker healthcheck `healthy`, runs as uid 1000, login starts in the container, files owner-only, stops in under 1 s | Not deployed to the homelab yet | Built and tested locally |

## Test results (Node 24.22.3)

```
$ npm test
ℹ tests 36
ℹ pass 36
ℹ fail 0
```
The suite also passes on Node 27.0.0-alpha. `npm run login` itself refuses to run on Node 27+.

Static and dependency review:
- `npm audit --omit=dev`: 3 **low** advisories, all `cookie <0.7.0` (GHSA-pxg6-pf52-xh8x), inside alexa-cookie2's login proxy. Accepted and documented (`docs/research.md` §1). No high or critical findings.
- Runtime dependencies: `alexa-remote2@8.1.1` (pinned) and its tree only.

## Issues found during live testing (all fixed)

1. **Node 27 crash during login.** `http-proxy-response-rewrite@0.0.1` calls `zlib.Gunzip()` without `new`. Fixed by `.nvmrc` = 24 and a guard in `src/login.js`.
2. **`npm test` didn't start on Node 24.** It passed a folder name to `node --test`, which only Node 27 accepts. Fixed with a file glob.
3. **Device list included music groups (`WHA`) and Alexa app installs (`VOX`).** Both report `VOLUME_SETTING`. Fixed by also filtering on device family.
4. **The login library's registration data was written with loose permissions, or not at all.** Fixed: the data dir is created before login, and `umask 077` is set.

## Outstanding steps (user)

1. Deploy the container on Unraid/Portainer (README §1) and copy the existing session from `./data` into the container's data folder, or log in again.
2. Set up the HTTPS endpoint for the bridge (README §3, NGINX Proxy Manager example).
3. Install the Hubitat driver and app (README §4). Then test single-Echo `speak`, zone `speak`, `playMp3`, the `lastResult` attribute, and one Rule Machine action of each kind.
4. Optional: a 3+ device zone test, and a check of how simultaneous zone playback sounds across rooms.

## Next actions

- Fix anything the hub test turns up, and mark the Hubitat layer VERIFIED-HW.
- Watch alexa-cookie2 for removal of `http-proxy-response-rewrite` (Node 27 support) and for fixes to the `cookie` advisory.
