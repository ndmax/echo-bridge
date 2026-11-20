# Implementation plan

## Architecture
```
Rule Machine ─▶ Hubitat child device (speak / playMp3)
                 │ asynchttpPost, Bearer token, HTTPS via NGINX Proxy Manager
                 ▼
             Node bridge (node:http, LAN/loopback)
                 │ alexa-remote2 httpsGet POST /api/behaviors/preview  (exactly one per action)
                 ▼
             Amazon (unofficial Alexa app API) ─▶ Echo(s)
```

## Bridge API (all JSON; all but /health need `Authorization: Bearer <BRIDGE_TOKEN>`)
| Route | Body | Success | Errors |
|---|---|---|---|
| `GET /health` | – | `{ok:true, amazon:"ready"\|"login-required"}` | – |
| `GET /devices` | – | `{devices:[{id, name, family, online}]}` (id = serial) | 401, 503 not logged in |
| `POST /speak` | `{targets:[id…], text}` | `{accepted:true, mode:"speak"\|"announcement", targets:n}` | 400, 401, 403 non-allowlisted, 429, 502, 503 |
| `POST /play` | `{target:id, url}` | `{accepted:true}` | 400, 401, 403, 429, 502, 503 |

`accepted` means Amazon accepted the sequence; it does not prove audible output.

- One target → `Alexa.Speak` (no chime). Two or more → one `AlexaAnnouncement` with all targets (chime). No fallback.
- Limits (configurable): text ≤ 250 characters, zone ≤ 10 devices, URL ≤ 200 characters, `https:` only, hostname in `MEDIA_HOST_ALLOWLIST`, no userinfo, no IP-literal hosts, no `localhost`/`.local`/`.lan`/`.home.arpa`, no fragment.
- Device IDs must be in `ALLOWED_DEVICE_IDS` (if set) **and** known to the logged-in account.
- Inbound token bucket (default 6 actions/min, burst 3). After an Amazon throttle the bridge cools down for 60 s and returns 429 with `Retry-After`.

## Files
- `src/config.js`: reads and validates env.
- `src/validate.js`: pure validators.
- `src/alexa.js`: login, device list, `buildSpeakNode`, `buildAnnouncementNode`, `sendSequence` (single POST, `isRetry:true`).
- `src/server.js`: routes, auth, limiter, error mapping.
- `src/login.js`: on-demand proxy login CLI (`npm run login`).
- `test/*.test.js`: node:test.
- `hubitat/echo-bridge-app.groovy`, `hubitat/echo-bridge-device.groovy`.
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`.

## Milestones
M2 skeleton → M3 transport + /devices + /speak → M4 login → M5 /play (UNVERIFIED) → M6 Hubitat → M7 packaging and docs. Details and status are in `PROGRESS.md` and `status.md`.
