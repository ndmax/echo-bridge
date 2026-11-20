// Pure input validators. Each returns a cleaned value or throws a 400/403 BridgeError.
import { BridgeError, badRequest } from './errors.js';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Control characters other than ordinary whitespace are never useful in speech.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// Hostnames that can never be reachable by Amazon over the public internet.
const PRIVATE_SUFFIXES = ['localhost', '.local', '.lan', '.internal', '.home.arpa', '.localdomain'];

export function validateText(text, maxLength) {
  if (typeof text !== 'string') throw badRequest('text must be a string');
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) throw badRequest('text must not be empty');
  if (cleaned.length > maxLength) throw badRequest(`text must be at most ${maxLength} characters`);
  if (CONTROL_CHARS.test(cleaned)) throw badRequest('text contains control characters');
  // Plain-text speech only: angle brackets could be interpreted as SSML by Alexa.
  if (/[<>]/.test(cleaned)) throw badRequest('text must not contain < or >');
  return cleaned;
}

export function validateDeviceId(id, allowedDeviceIds) {
  if (typeof id !== 'string' || !DEVICE_ID_PATTERN.test(id)) {
    throw badRequest('device ids must be 1-64 letters, digits, "_" or "-"');
  }
  if (allowedDeviceIds.size > 0 && !allowedDeviceIds.has(id)) {
    throw new BridgeError(403, 'device_not_allowed', 'device id is not in ALLOWED_DEVICE_IDS');
  }
  return id;
}

export function validateTargets(targets, { allowedDeviceIds, maxZoneSize }) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw badRequest('targets must be a non-empty array of device ids');
  }
  if (targets.length > maxZoneSize) throw badRequest(`a zone may have at most ${maxZoneSize} devices`);
  const ids = targets.map((id) => validateDeviceId(id, allowedDeviceIds));
  if (new Set(ids).size !== ids.length) throw badRequest('targets must not contain duplicates');
  return ids;
}

function isIpLiteral(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':') || hostname.startsWith('[');
}

// The bridge never fetches the URL; these checks only make sure we hand Amazon
// a public, permanent, credential-free HTTPS MP3 link on an allowlisted host.
export function validateMediaUrl(rawUrl, { mediaHostAllowlist, maxUrlLength }) {
  if (typeof rawUrl !== 'string' || !rawUrl) throw badRequest('url must be a non-empty string');
  if (rawUrl.length > maxUrlLength) throw badRequest(`url must be at most ${maxUrlLength} characters`);
  if (/\s/.test(rawUrl)) throw badRequest('url must not contain whitespace');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest('url is not a valid absolute URL');
  }
  if (url.protocol !== 'https:') throw badRequest('url must use https');
  if (url.username || url.password) throw badRequest('url must not contain credentials');
  if (url.port && url.port !== '443') throw badRequest('url must use the default HTTPS port 443');
  if (url.search || url.hash) throw badRequest('url must not contain a query string or fragment');

  const hostname = url.hostname.toLowerCase();
  if (isIpLiteral(hostname)) throw badRequest('url host must be a public DNS name, not an IP address');
  if (PRIVATE_SUFFIXES.some((suffix) => hostname === suffix.replace(/^\./, '') || hostname.endsWith(suffix))) {
    throw badRequest('url host must be publicly reachable');
  }
  if (!mediaHostAllowlist.has(hostname)) {
    throw new BridgeError(403, 'host_not_allowed', 'url host is not in MEDIA_HOST_ALLOWLIST');
  }
  if (!url.pathname.toLowerCase().endsWith('.mp3')) throw badRequest('url path must end in .mp3');
  if (url.href.length > maxUrlLength) throw badRequest(`url must be at most ${maxUrlLength} characters`);
  return url.href;
}
