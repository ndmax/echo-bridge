# Status

Last updated: 2026-11-21. Current release: 0.1.2.

**VERIFIED-HW** means heard on a real Echo, or seen working on real hardware, by us. Everything was tested with one Amazon US account. Evidence and sources are in [`research.md`](research.md).

## Feature status

| Feature | Implementation | Automated tests | Real hardware | Status |
|---|---|---|---|---|
| Single-Echo TTS | `POST /speak` → one `Alexa.Speak` | `test/alexa.test.js`, `test/server.test.js` | Spoke in under 1 s, normal English voice, no chime | **VERIFIED-HW** |
| Zone TTS, one Amazon request | `POST /speak` with 2+ targets → one `AlexaAnnouncement` listing all devices | One outbound `https.request` with every recipient; no retry or per-device fallback on 429/401/503/400. Mutation-checked: a per-device loop and re-enabled library retries both fail the tests | 2 Echos played immediately, one request | **VERIFIED-HW** |
| MP3 from a public HTTPS URL | `POST /play` → one `Alexa.Speak` with `<speak><audio src="URL"/></speak>` | `test/play.test.js`, `test/validate.test.js`: URL rules, XML escaping, 250-char limit, media host never contacted | User's 48 kbps / 24 kHz MP3 played immediately and completely | **VERIFIED-HW** (undocumented Amazon behavior) |
| Amazon login | `npm run login` / `docker exec … node src/login.js` (alexa-cookie2 proxy) | `test/login.test.js`: options, file permissions, failure path, CSP directive stripping, data-folder probe, real proxy start/stop with no Amazon traffic | Completed with 2FA on Node 24 (2026-11-20, loopback); completed in the Unraid container (2026-11-21, 0.1.2) | **VERIFIED-HW** |
| Hubitat app + driver | `hubitat/*.groovy` | groovyc 2.5 compile; a throwaway stubbed-API harness (23 checks: one request per zone, local rejections, child sync, error reporting, no token or URL logging) | Installed on the user's hub 2026-11-21: single-Echo TTS, zone `speak`, and `playMp3` played; `playMp3` on a zone is refused locally by design | **VERIFIED-HW** |
| Docker packaging | `Dockerfile`, `docker-compose.yml` | Image built and checked: `/health` OK, healthcheck `healthy`, runs as a non-root user, files owner-only | Published as `endiemachswell/echo-bridge` (amd64 + arm64). Deployed on Unraid 2026-11-21 as 0.1.2 behind HTTPS; login, TTS, zone and MP3 work end to end | **VERIFIED-HW** (Unraid) |

## Test results

```
$ npm test          # 2026-11-21, Node 24.22.3 (node:24-alpine container) and Node 27.0.0-alpha
ℹ tests 39
ℹ pass 39
ℹ fail 0
```
`npm run login` itself refuses to run on Node 27+ (see below).

Dependency review: `npm audit --omit=dev` reports 3 **low** advisories, all `cookie <0.7.0` (GHSA-pxg6-pf52-xh8x) inside alexa-cookie2's login proxy. Accepted (`research.md` §1). The only runtime dependency is `alexa-remote2@8.1.1` (pinned) and its tree.

## Maintainer notes

Problems found during live testing, all fixed. Keep these in mind when changing login, packaging or device discovery.

- **Test login on a LAN IP, as users deploy it.** Amazon's `/ax/claim` page sends `Content-Security-Policy: upgrade-insecure-requests`, which makes browsers switch the plain-HTTP login proxy to HTTPS (`ERR_SSL_PROTOCOL_ERROR`). Loopback (`127.0.0.1`) is treated as secure and hides this. `src/login.js` strips only that directive (fixed in 0.1.1).
- **Login needs a writable data folder.** If the container user can't write `DATA_DIR` (for example `PUID`/`PGID` not applied, leaving uid 1000 against a root-owned folder), the session isn't saved. Since 0.1.2 the login checks the folder first and names the error code, path, and uid/gid.
- **Node 27 breaks login.** `http-proxy-response-rewrite@0.0.1` (pulled in by alexa-cookie2) calls `zlib.Gunzip()` without `new`. `.nvmrc` pins Node 24, and `src/login.js` refuses Node 27+.
- **Device list filtering.** Music groups (`WHA`) and Alexa app installs (`VOX`) report `VOLUME_SETTING` like Echos do, so `/devices` also filters on device family.
- **File permissions.** The login library writes registration data; the data folder is created first and the process runs with `umask 077`.
- **`npm test` glob.** Pass a file glob to `node --test`, not a folder name; only Node 27 accepts folders.

## Optional checks (user)

- One Rule Machine action of each kind.
- A zone of 3+ Echos, and how simultaneous zone playback sounds across rooms.

## Watch

- alexa-cookie2: removal of `http-proxy-response-rewrite` (Node 27 support) and fixes for the `cookie` advisory.
