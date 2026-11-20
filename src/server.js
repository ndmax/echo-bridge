// Small authenticated LAN API used by the Hubitat driver.
// Routes: GET /health, GET /devices, POST /speak, POST /play (see docs/implementation-plan.md).
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AlexaClient } from './alexa.js';
import { loadConfig } from './config.js';
import { BridgeError, badRequest } from './errors.js';
import { RateLimiter } from './rate-limit.js';
import { validateDeviceId, validateMediaUrl, validateTargets, validateText } from './validate.js';

const MAX_BODY_BYTES = 4096;

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

// Hashing first gives equal-length buffers, so timingSafeEqual never leaks the token length.
function isAuthorized(req, expectedTokenHash) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  return Boolean(match) && timingSafeEqual(sha256(match[1]), expectedTokenHash);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  // Requiring JSON also blocks simple cross-site form posts (CSRF) from browsers.
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new BridgeError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BridgeError(413, 'body_too_large', 'request body is too large');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body;
  } catch {
    throw badRequest('body must be a JSON object');
  }
}

export function createBridgeServer({ config, alexa, limiter, log = console.log }) {
  const tokenHash = sha256(config.token);
  limiter ??= new RateLimiter({ perMinute: config.rateLimitPerMinute, burst: config.rateLimitBurst });

  // Every action that reaches Amazon goes through here: rate limit, then exactly one call.
  async function runAmazonAction(action) {
    const waitSeconds = limiter.take();
    if (waitSeconds > 0) {
      throw new BridgeError(429, 'rate_limited', 'too many requests; try again later', { retryAfter: waitSeconds });
    }
    try {
      return await action();
    } catch (err) {
      if (err.code === 'amazon_throttled') {
        limiter.startCooldown(config.throttleCooldownSeconds);
        err.retryAfter = config.throttleCooldownSeconds;
      }
      throw err;
    }
  }

  const routes = {
    'GET /health': async () => ({ ok: true, amazon: alexa.status() }),

    'GET /devices': async () => ({ devices: await alexa.listDevices() }),

    'POST /speak': async (req) => {
      const body = await readJsonBody(req);
      const targets = validateTargets(body.targets, config);
      const text = validateText(body.text, config.maxTextLength);
      const result = await runAmazonAction(() => alexa.speak(targets, text));
      return { accepted: true, mode: result.mode, targets: targets.length };
    },

    // UNVERIFIED on hardware: "accepted" only means Amazon accepted the request.
    'POST /play': async (req) => {
      const body = await readJsonBody(req);
      const target = validateDeviceId(body.target, config.allowedDeviceIds);
      const url = validateMediaUrl(body.url, config);
      await runAmazonAction(() => alexa.playMp3(target, url));
      return { accepted: true, verified: false };
    },
  };

  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://bridge').pathname;
    const routeKey = `${req.method} ${path}`;
    let status = 200;
    try {
      const handler = routes[routeKey];
      if (!handler) throw new BridgeError(404, 'not_found', 'no such route');
      // /health is public so monitors can use it; it reveals no secrets or device details.
      if (routeKey !== 'GET /health' && !isAuthorized(req, tokenHash)) {
        throw new BridgeError(401, 'unauthorized', 'missing or invalid bearer token');
      }
      sendJson(res, status, await handler(req));
    } catch (err) {
      const known = err instanceof BridgeError;
      status = known ? err.status : 500;
      const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
      sendJson(res, status, {
        error: known ? err.code : 'internal_error',
        message: known ? err.message : 'internal error',
      }, headers);
      // Unexpected errors are logged by type only; their messages might contain upstream data.
      if (!known) log(`internal error: ${err?.name || 'Error'}`);
    } finally {
      // Never log bodies: they contain message text and media URLs.
      log(`${req.method} ${path} -> ${status}`);
    }
  });
}

async function main() {
  const config = loadConfig();
  const alexa = new AlexaClient({ config });
  const server = createBridgeServer({ config, alexa });
  server.listen(config.port, config.host, () => console.log(`echo-bridge listening on ${config.host}:${config.port}`));
  // Serve /health immediately; speech routes return 503 until the saved session is loaded.
  const connected = await alexa.connect();
  console.log(connected ? 'Amazon session ready' : 'Amazon login required: run "npm run login"');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`startup failed: ${err.message}`);
    process.exit(1);
  });
}
