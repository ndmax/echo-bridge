// Amazon transport: a thin wrapper around alexa-remote2 (MIT, https://github.com/Apollon77/alexa-remote).
//
// Every speech action is exactly ONE POST to /api/behaviors/preview (the Alexa app's
// unofficial "routine preview" endpoint). We build the sequence node ourselves rather than
// using alexa-remote2's sendSequenceCommand helpers because those hard-code the de-DE locale
// and silently drop unknown devices (see docs/research.md §1).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import AlexaRemote from 'alexa-remote2';
import { BridgeError } from './errors.js';

const NODE_TYPE = 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode';
const THROTTLE_MARKERS = ['ThrottlingException', 'Rate exceeded', 'Too many requests'];
// Families that report VOLUME_SETTING but are not speakers we can target:
// WHA = multi-room music groups, VOX = Alexa app installs on phones/tablets (seen on a real account).
const NON_SPEAKER_FAMILIES = new Set(['WHA', 'VOX']);

// Alexa.Speak: plain speech on one device, no chime (amzn1.ask.1p.saysomething).
export function buildSpeakNode(device, textToSpeak, locale) {
  return {
    '@type': NODE_TYPE,
    type: 'Alexa.Speak',
    skillId: 'amzn1.ask.1p.saysomething',
    operationPayload: {
      deviceType: device.deviceType,
      deviceSerialNumber: device.serialNumber,
      customerId: device.deviceOwnerCustomerId,
      locale,
      textToSpeak,
    },
  };
}

// AlexaAnnouncement: ONE node whose target lists every device; Amazon fans it out.
export function buildAnnouncementNode(devices, text, locale) {
  const customerId = devices[0].deviceOwnerCustomerId;
  return {
    '@type': NODE_TYPE,
    type: 'AlexaAnnouncement',
    skillId: 'amzn1.ask.1p.routines.messaging',
    operationPayload: {
      customerId,
      expireAfter: 'PT5S',
      content: [{
        locale,
        display: { title: 'Echo Bridge', body: text },
        speak: { type: 'text', value: text },
      }],
      target: {
        customerId,
        devices: devices.map((d) => ({ deviceSerialNumber: d.serialNumber, deviceTypeId: d.deviceType })),
      },
    },
  };
}

// alexa-remote2 and Amazon cap textToSpeak at 250 characters, SSML wrapper included.
export const MAX_TEXT_TO_SPEAK = 250;

function escapeXmlAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Undocumented Amazon behavior, hardware-verified 2026-11-20 (docs/feasibility.md): Alexa.Speak
// with an SSML <audio> tag plays a public HTTPS MP3. Announcements reportedly ignore <audio>.
export function buildAudioSsml(url) {
  const ssml = `<speak><audio src="${escapeXmlAttribute(url)}"/></speak>`;
  if (ssml.length > MAX_TEXT_TO_SPEAK) {
    throw new BridgeError(400, 'bad_request', 'url is too long for Alexa (250-character SSML limit)');
  }
  return ssml;
}

export function buildPreviewRequest(node) {
  const sequence = { '@type': 'com.amazon.alexa.behaviors.model.Sequence', startNode: node };
  return { behaviorId: 'PREVIEW', sequenceJson: JSON.stringify(sequence), status: 'ENABLED' };
}

function isThrottle(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return THROTTLE_MARKERS.some((marker) => text.includes(marker));
}

// alexa-remote2 reports success as {success:true} for an empty 2xx body. Any other result,
// including a JSON body (non-2xx status codes are not exposed), is treated as a failure.
export function interpretPreviewResult(err, result) {
  if (!err && result && result.success === true) return;
  if (isThrottle(result) || isThrottle(err?.message)) {
    throw new BridgeError(429, 'amazon_throttled', 'Amazon is rate limiting requests; try again later');
  }
  if (err && /401|Cookie invalid/.test(err.message)) {
    throw new BridgeError(503, 'amazon_auth_failed', 'Amazon session expired; run the login again');
  }
  if (err && /Timeout|ECONN|ENOTFOUND|EAI_AGAIN|Connection Closed/.test(err.message)) {
    throw new BridgeError(502, 'amazon_unreachable', 'could not reach Amazon');
  }
  throw new BridgeError(502, 'amazon_rejected', 'Amazon did not accept the request');
}

export class AlexaClient {
  constructor({ config, remote = new AlexaRemote() }) {
    this.config = config;
    this.remote = remote;
    this.ready = false;
  }

  status() {
    return this.ready ? 'ready' : 'login-required';
  }

  // Starts from a saved session. Never triggers an interactive login; that is `npm run login`.
  async connect() {
    let cookieData;
    try {
      cookieData = JSON.parse(await readFile(this.config.cookieFile, 'utf8'));
    } catch {
      return false; // no saved session yet
    }
    // alexa-remote2 emits 'cookie' after every refresh; persist the refreshed session data.
    this.remote.on('cookie', () => {
      if (this.remote.cookieData) this.saveSession(this.remote.cookieData).catch(() => {});
    });
    return new Promise((resolve) => {
      this.remote.init({
        cookie: cookieData,
        amazonPage: this.config.amazonPage,
        acceptLanguage: this.config.alexaLocale,
        // Only what speech needs: no push connection, bluetooth or notification polling.
        useWsMqtt: false,
        usePushConnection: false,
        bluetooth: false,
        notifications: false,
        // Deliberately no logger: the library logs cookies and full responses.
      }, (err) => {
        // init's callback also fires after each scheduled cookie refresh.
        this.ready = !err;
        resolve(this.ready);
      });
    });
  }

  async saveSession(cookieData) {
    await mkdir(dirname(this.config.cookieFile), { recursive: true, mode: 0o700 });
    await writeFile(this.config.cookieFile, JSON.stringify(cookieData), { mode: 0o600 });
  }

  requireReady() {
    if (!this.ready) throw new BridgeError(503, 'amazon_not_ready', 'Amazon login required');
  }

  // Looks up by serial number only; alexa-remote2's find() also matches names, which we don't want.
  device(id) {
    const device = this.remote.serialNumbers[id];
    if (!device) throw new BridgeError(400, 'unknown_device', 'device id is not on the Amazon account');
    return device;
  }

  async listDevices() {
    this.requireReady();
    return Object.values(this.remote.serialNumbers)
      .filter((d) => !NON_SPEAKER_FAMILIES.has(d.deviceFamily))
      .filter((d) => Array.isArray(d.capabilities) && d.capabilities.includes('VOLUME_SETTING'))
      .map((d) => ({ id: d.serialNumber, name: d.accountName, family: d.deviceFamily, online: Boolean(d.online) }));
  }

  // One target -> Alexa.Speak; several -> ONE announcement. Never one request per device.
  async speak(targets, text) {
    this.requireReady();
    const devices = targets.map((id) => this.device(id));
    if (devices.length === 1) {
      await this.sendPreview(buildSpeakNode(devices[0], text, this.config.alexaLocale));
      return { mode: 'speak' };
    }
    await this.sendPreview(buildAnnouncementNode(devices, text, this.config.alexaLocale));
    return { mode: 'announcement' };
  }

  // Passes the URL to Amazon only; the bridge never fetches, proxies or caches the media.
  async playMp3(target, url) {
    this.requireReady();
    const device = this.device(target);
    await this.sendPreview(buildSpeakNode(device, buildAudioSsml(url), this.config.alexaLocale));
    return { mode: 'ssml-audio' };
  }

  // The single outbound Amazon operation. isRetry:true disables alexa-remote2's own delayed
  // retry on 503/throttling so a stale message is never spoken a minute later.
  sendPreview(node) {
    const body = JSON.stringify(buildPreviewRequest(node));
    return new Promise((resolve, reject) => {
      this.remote.httpsGet('/api/behaviors/preview', (err, result) => {
        try {
          interpretPreviewResult(err, result);
          resolve();
        } catch (bridgeErr) {
          reject(bridgeErr);
        }
      }, { method: 'POST', data: body, isRetry: true });
    });
  }
}
