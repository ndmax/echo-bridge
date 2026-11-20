// MP3 playback (UNVERIFIED on hardware). These tests prove what the bridge sends and that it
// never contacts the media host; they cannot prove an Echo plays the file.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import AlexaRemote from 'alexa-remote2';
import { AlexaClient, buildAudioSsml } from '../src/alexa.js';
import { createBridgeServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const TOKEN = 't'.repeat(40);
const URL_OK = 'https://media.example.com/sounds/doorbell.mp3';
const ENV = { BRIDGE_TOKEN: TOKEN, MEDIA_HOST_ALLOWLIST: 'media.example.com' };

let requests;
beforeEach(() => {
  requests = [];
  mock.method(https, 'request', (options, onResponse) => {
    const req = new EventEmitter();
    const record = { host: options.host, path: options.path, method: options.method, body: '' };
    requests.push(record);
    req.write = (data) => { record.body += data; };
    req.end = () => setImmediate(() => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = {};
      onResponse(res);
      res.emit('end');
    });
    return req;
  });
});
afterEach(() => mock.restoreAll());

function readyClient(env = ENV) {
  const config = loadConfig(env);
  const remote = new AlexaRemote();
  remote._options = { amazonPage: 'amazon.com', acceptLanguage: 'en-US', apiUserAgentPostfix: '' };
  remote.baseUrl = 'alexa.amazon.com';
  remote.cookie = 'csrf=fake';
  remote.csrf = 'fake';
  remote.lastAuthCheck = Date.now();
  remote.serialNumbers = {
    OFFICE3: { serialNumber: 'OFFICE3', deviceType: 'A32DOYMUN6DTXA', deviceOwnerCustomerId: 'CUST1', capabilities: ['VOLUME_SETTING'] },
  };
  const client = new AlexaClient({ config, remote });
  client.ready = true;
  return client;
}

async function withServer(client, fn) {
  const server = createBridgeServer({ config: client.config, alexa: client, log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const play = (body, token = TOKEN) => fetch(`http://127.0.0.1:${server.address().port}/play`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  try { await fn(play); } finally { server.close(); }
}

test('SSML wraps and escapes the URL and enforces the 250-character limit', () => {
  assert.equal(buildAudioSsml(URL_OK), `<speak><audio src="${URL_OK}"/></speak>`);
  assert.equal(buildAudioSsml("https://m.example.com/it's.mp3"), '<speak><audio src="https://m.example.com/it&apos;s.mp3"/></speak>');
  assert.throws(() => buildAudioSsml(`https://m.example.com/${'a'.repeat(220)}.mp3`), { status: 400 });
});

test('play: one Alexa.Speak POST to Amazon carrying the SSML; media host never contacted', async () => {
  const client = readyClient();
  await withServer(client, async (play) => {
    const res = await play({ target: 'OFFICE3', url: URL_OK });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true, verified: false });
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].host, 'alexa.amazon.com');
  assert.equal(requests[0].path, '/api/behaviors/preview');
  assert.ok(requests.every((r) => r.host !== 'media.example.com'), 'bridge must not fetch the MP3');
  const node = JSON.parse(JSON.parse(requests[0].body).sequenceJson).startNode;
  assert.equal(node.type, 'Alexa.Speak');
  assert.equal(node.operationPayload.deviceSerialNumber, 'OFFICE3');
  assert.equal(node.operationPayload.textToSpeak, `<speak><audio src="${URL_OK}"/></speak>`);
});

test('play: rejected inputs never reach Amazon', async () => {
  const client = readyClient();
  await withServer(client, async (play) => {
    const cases = [
      [{ target: 'OFFICE3', url: 'http://media.example.com/a.mp3' }, 400],
      [{ target: 'OFFICE3', url: 'https://192.168.1.5/a.mp3' }, 400],
      [{ target: 'OFFICE3', url: 'https://hubitat.local/local/a.mp3' }, 400],
      [{ target: 'OFFICE3', url: 'https://media.example.com/a.mp3?sig=secret' }, 400],
      [{ target: 'OFFICE3', url: 'https://evil.example.org/a.mp3' }, 403],
      [{ target: 'OFFICE3', url: 'doorbell.mp3' }, 400],
      [{ target: 'OFFICE3' }, 400],
      [{ target: ['OFFICE3'], url: URL_OK }, 400],
      [{ target: 'NOPE', url: URL_OK }, 400],
    ];
    for (const [body, status] of cases) assert.equal((await play(body)).status, status, JSON.stringify(body));
    assert.equal((await play({ target: 'OFFICE3', url: URL_OK }, 'wrong')).status, 401);
  });
  assert.equal(requests.length, 0);
});

test('play: disabled when MEDIA_HOST_ALLOWLIST is empty', async () => {
  const client = readyClient({ BRIDGE_TOKEN: TOKEN });
  await withServer(client, async (play) => {
    const res = await play({ target: 'OFFICE3', url: URL_OK });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'playback_disabled');
  });
  assert.equal(requests.length, 0);
});
