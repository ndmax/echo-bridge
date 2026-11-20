// These tests intercept Node's https.request, the call alexa-remote2 uses for every Amazon
// request, so they count real outbound requests rather than calls into our own wrapper.
// They prove what the bridge SENDS, not how Amazon or an Echo responds.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import AlexaRemote from 'alexa-remote2';
import { AlexaClient } from '../src/alexa.js';
import { createBridgeServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const TOKEN = 't'.repeat(40);
const DEVICES = {
  KITCHEN1: { serialNumber: 'KITCHEN1', deviceType: 'A3S5BH2HU6VAYF', deviceOwnerCustomerId: 'CUST1', accountName: 'Kitchen', deviceFamily: 'ECHO', online: true, capabilities: ['VOLUME_SETTING', 'MICROPHONE'] },
  LIVING2: { serialNumber: 'LIVING2', deviceType: 'A4ZP7ZC4PI6TO', deviceOwnerCustomerId: 'CUST1', accountName: 'Living Room', deviceFamily: 'KNIGHT', online: true, capabilities: ['VOLUME_SETTING'] },
  OFFICE3: { serialNumber: 'OFFICE3', deviceType: 'A32DOYMUN6DTXA', deviceOwnerCustomerId: 'CUST1', accountName: 'Office', deviceFamily: 'ECHO', online: false, capabilities: ['VOLUME_SETTING'] },
  // Real accounts report VOLUME_SETTING for music groups and Alexa app installs too.
  GROUP9: { serialNumber: 'GROUP9', deviceType: 'A3C9PE6TNYLTCH', deviceOwnerCustomerId: 'CUST1', accountName: 'Everywhere', deviceFamily: 'WHA', online: true, capabilities: ['VOLUME_SETTING'] },
  PHONE8: { serialNumber: 'PHONE8', deviceType: 'A2TF17PFR55MTB', deviceOwnerCustomerId: 'CUST1', accountName: 'This Device', deviceFamily: 'VOX', online: true, capabilities: ['VOLUME_SETTING'] },
  NOVOL7: { serialNumber: 'NOVOL7', deviceType: 'A1RABVCI4QCIKC', deviceOwnerCustomerId: 'CUST1', accountName: 'Remote', deviceFamily: 'OTHER', online: true, capabilities: [] },
};

let requests;
let nextResponse;

beforeEach(() => {
  requests = [];
  nextResponse = { status: 200, body: '' };
  mock.method(https, 'request', (options, onResponse) => {
    const req = new EventEmitter();
    const record = { host: options.host, path: options.path, method: options.method, headers: options.headers, body: '' };
    requests.push(record);
    req.write = (data) => { record.body += data; };
    req.end = () => setImmediate(() => {
      const res = new EventEmitter();
      res.statusCode = nextResponse.status;
      res.headers = {};
      onResponse(res);
      if (nextResponse.body) res.emit('data', Buffer.from(nextResponse.body));
      res.emit('end');
    });
    return req;
  });
});

afterEach(() => mock.restoreAll());

// A real alexa-remote2 instance in the state init() leaves it in, without contacting Amazon.
function readyClient(env = {}) {
  const config = loadConfig({ BRIDGE_TOKEN: TOKEN, ...env });
  const remote = new AlexaRemote();
  remote._options = { amazonPage: 'amazon.com', acceptLanguage: 'en-US', apiUserAgentPostfix: '' };
  remote.baseUrl = 'alexa.amazon.com';
  remote.cookie = 'session-id=fake; csrf=fakecsrf';
  remote.csrf = 'fakecsrf';
  remote.lastAuthCheck = Date.now(); // skip the periodic auth-check GET
  remote.serialNumbers = structuredClone(DEVICES);
  const client = new AlexaClient({ config, remote });
  client.ready = true;
  return client;
}

function sentSequence(request) {
  const body = JSON.parse(request.body);
  assert.equal(body.behaviorId, 'PREVIEW');
  return JSON.parse(body.sequenceJson);
}

test('single device: exactly one POST with an Alexa.Speak node', async () => {
  const client = readyClient();
  assert.deepEqual(await client.speak(['KITCHEN1'], 'Front door is open'), { mode: 'speak' });

  assert.equal(requests.length, 1);
  const [req] = requests;
  assert.equal(req.method, 'POST');
  assert.equal(req.host, 'alexa.amazon.com');
  assert.equal(req.path, '/api/behaviors/preview');
  const node = sentSequence(req).startNode;
  assert.equal(node.type, 'Alexa.Speak');
  assert.equal(node.skillId, 'amzn1.ask.1p.saysomething');
  assert.deepEqual(node.operationPayload, {
    deviceType: 'A3S5BH2HU6VAYF', deviceSerialNumber: 'KITCHEN1', customerId: 'CUST1',
    locale: 'en-US', textToSpeak: 'Front door is open',
  });
});

test('zone: exactly one outbound Amazon request containing every recipient', async () => {
  const client = readyClient();
  assert.deepEqual(await client.speak(['KITCHEN1', 'LIVING2', 'OFFICE3'], 'Dinner is ready'), { mode: 'announcement' });

  assert.equal(requests.length, 1, 'a zone must never become one request per device');
  const node = sentSequence(requests[0]).startNode;
  assert.equal(node.type, 'AlexaAnnouncement');
  assert.equal(node.skillId, 'amzn1.ask.1p.routines.messaging');
  assert.deepEqual(node.operationPayload.target.devices.map((d) => d.deviceSerialNumber), ['KITCHEN1', 'LIVING2', 'OFFICE3']);
  assert.deepEqual(node.operationPayload.content[0].speak, { type: 'text', value: 'Dinner is ready' });
  assert.equal(node.operationPayload.content[0].locale, 'en-US');
  assert.ok(!requests[0].body.includes('de-DE'), 'library default locale must not leak in');
});

test('zone with an unknown device sends nothing', async () => {
  const client = readyClient();
  await assert.rejects(client.speak(['KITCHEN1', 'NOPE'], 'hi'), { status: 400, code: 'unknown_device' });
  assert.equal(requests.length, 0);
});

test('Amazon throttling: one request, no library retry, no per-device fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nextResponse = { status: 429, body: 'Too many requests' };
  const client = readyClient();
  let outcome = 'pending';
  client.speak(['KITCHEN1', 'LIVING2'], 'hi').then(() => { outcome = 'resolved'; }, (err) => { outcome = err; });
  const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r)); };
  // setImmediate is not mocked, so the fake response arrives during flush().
  await flush();
  t.mock.timers.tick(120_000); // a retry alexa-remote2 scheduled (10-60 s) would fire now
  await flush();
  assert.equal(requests.length, 1, 'throttled request must not be retried');
  assert.equal(outcome.code, 'amazon_throttled', 'caller must get the throttle error immediately');
});

test('throttling reported as JSON is also detected', { timeout: 5000 }, async () => {
  nextResponse = { status: 400, body: '{"message":"Rate exceeded","__type":"ThrottlingException"}' };
  await assert.rejects(readyClient().speak(['KITCHEN1'], 'hi'), { status: 429 });
  assert.equal(requests.length, 1);
});

test('other Amazon failures map to clear errors without retries', { timeout: 5000 }, async () => {
  const cases = [
    [{ status: 401, body: '' }, 503, 'amazon_auth_failed'],
    [{ status: 503, body: '' }, 502, 'amazon_rejected'],
    [{ status: 400, body: '{"message":"Invalid sequence"}' }, 502, 'amazon_rejected'],
  ];
  for (const [response, status, code] of cases) {
    requests = [];
    nextResponse = response;
    await assert.rejects(readyClient().speak(['KITCHEN1'], 'hi'), { status, code });
    assert.equal(requests.length, 1, `${response.status} must not be retried`);
  }
});

test('not logged in: 503 and no Amazon traffic', async () => {
  const client = readyClient();
  client.ready = false;
  await assert.rejects(client.speak(['KITCHEN1'], 'hi'), { status: 503 });
  await assert.rejects(client.listDevices(), { status: 503 });
  assert.equal(requests.length, 0);
});

test('device list shows speakers only, with minimal fields', async () => {
  const devices = await readyClient().listDevices();
  assert.deepEqual(devices.map((d) => d.id), ['KITCHEN1', 'LIVING2', 'OFFICE3']);
  assert.deepEqual(devices[0], { id: 'KITCHEN1', name: 'Kitchen', family: 'ECHO', online: true });
  assert.equal(requests.length, 0, 'device list is served from the cached init data');
});

test('connect without a saved session stays in login-required state', async () => {
  const config = loadConfig({ BRIDGE_TOKEN: TOKEN, COOKIE_FILE: '/nonexistent/cookie.json' });
  const client = new AlexaClient({ config, remote: new AlexaRemote() });
  assert.equal(await client.connect(), false);
  assert.equal(client.status(), 'login-required');
  assert.equal(requests.length, 0);
});

test('end to end: one Hubitat zone request becomes one Amazon request', async () => {
  const client = readyClient();
  const server = createBridgeServer({ config: client.config, alexa: client, log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/speak`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: ['KITCHEN1', 'LIVING2', 'OFFICE3'], text: 'Downstairs test' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true, mode: 'announcement', targets: 3 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, '/api/behaviors/preview');
  } finally {
    server.close();
  }
});
