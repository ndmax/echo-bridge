// Reads bridge settings from environment variables (see .env.example).
// Fails fast on unsafe settings rather than starting with weak defaults.

const MIN_TOKEN_LENGTH = 32;

function list(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function int(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const token = env.BRIDGE_TOKEN || '';
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`BRIDGE_TOKEN must be set and at least ${MIN_TOKEN_LENGTH} characters`);
  }

  return {
    token,
    host: env.HOST || '127.0.0.1',
    port: int(env, 'PORT', 3456, 1, 65535),

    // Empty list = any device on the logged-in Amazon account may be targeted.
    allowedDeviceIds: new Set(list(env.ALLOWED_DEVICE_IDS)),
    // Empty list = MP3 playback disabled (every URL is rejected).
    mediaHostAllowlist: new Set(list(env.MEDIA_HOST_ALLOWLIST).map((h) => h.toLowerCase())),

    // 250 is alexa-remote2's own textToSpeak limit; going higher would only fail later.
    maxTextLength: int(env, 'MAX_TEXT_LENGTH', 250, 1, 250),
    maxZoneSize: int(env, 'MAX_ZONE_SIZE', 10, 2, 25),
    // The URL is wrapped in SSML inside the same 250-character field.
    maxUrlLength: int(env, 'MAX_URL_LENGTH', 200, 20, 210),

    rateLimitPerMinute: int(env, 'RATE_LIMIT_PER_MINUTE', 6, 1, 60),
    rateLimitBurst: int(env, 'RATE_LIMIT_BURST', 3, 1, 20),
    throttleCooldownSeconds: int(env, 'THROTTLE_COOLDOWN_SECONDS', 60, 10, 3600),

    amazonPage: env.AMAZON_PAGE || 'amazon.com',
    alexaLocale: env.ALEXA_LOCALE || 'en-US',
    cookieFile: env.COOKIE_FILE || './data/alexa-cookie.json',

    loginProxyIp: env.LOGIN_PROXY_IP || '',
    loginProxyPort: int(env, 'LOGIN_PROXY_PORT', 3457, 1, 65535),
  };
}
