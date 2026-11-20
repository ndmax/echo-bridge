import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/rate-limit.js';
import { BridgeError } from '../src/errors.js';

const TOKEN = 't'.repeat(40);

function fakeAlexa(overrides = {}) {
  const calls = [];
  return {
    calls,
    status: () => 'ready',
    listDevices: async () => [{ id: 'A1', name: 'Kitchen', family: 'ECHO', online: true }],
    speak: async (targets, text) => {
      calls.push({ targets, text });
      return { mode: targets.length > 1 ? 'announcement' : 'speak' };
    },
    ...overrides,
  };
}

async function withServer(options, fn) {
  const config = loadConfig({ BRIDGE_TOKEN: TOKEN, ...options.env });
  const logs = [];
  const server = createBridgeServer({ config, alexa: options.alexa, limiter: options.limiter, log: (l) => logs.push(l) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, { body, token = TOKEN, contentType = 'application/json' } = {}) =>
    fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': contentType },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  try {
    await fn(call, logs);
  } finally {
    server.close();
  }
}

test('health is public and reveals no secrets', async () => {
  await withServer({ alexa: fakeAlexa() }, async (call) => {
    const res = await call('GET', '/health', { token: null });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { ok: true, amazon: 'ready' });
    assert.ok(!text.includes(TOKEN));
  });
});

test('protected routes require the bearer token', async () => {
  const alexa = fakeAlexa();
  await withServer({ alexa }, async (call) => {
    for (const token of [null, 'wrong', TOKEN + 'x']) {
      assert.equal((await call('GET', '/devices', { token })).status, 401);
      const res = await call('POST', '/speak', { token, body: { targets: ['A1'], text: 'hi' } });
      assert.equal(res.status, 401);
    }
    assert.equal(alexa.calls.length, 0);
    assert.equal((await call('GET', '/devices')).status, 200);
  });
});

test('speak validates input before reaching Amazon', async () => {
  const alexa = fakeAlexa();
  await withServer({ alexa }, async (call) => {
    const bad = [
      { body: { targets: ['A1'] } },
      { body: { targets: [], text: 'hi' } },
      { body: { targets: ['A1'], text: 'x'.repeat(251) } },
      { body: '{not json' },
      { body: '[1,2]' },
    ];
    for (const req of bad) assert.equal((await call('POST', '/speak', req)).status, 400);
    assert.equal((await call('POST', '/speak', { body: { targets: ['A1'], text: 'hi' }, contentType: 'text/plain' })).status, 415);
    assert.equal((await call('POST', '/speak', { body: { targets: ['A1'], text: 'x'.repeat(5000) } })).status, 413);
    assert.equal(alexa.calls.length, 0);
  });
});

test('speak rejects devices outside ALLOWED_DEVICE_IDS', async () => {
  const alexa = fakeAlexa();
  await withServer({ alexa, env: { ALLOWED_DEVICE_IDS: 'A1,B2' } }, async (call) => {
    const res = await call('POST', '/speak', { body: { targets: ['A1', 'C3'], text: 'hi' } });
    assert.equal(res.status, 403);
    assert.equal(alexa.calls.length, 0);
  });
});

test('speak passes cleaned input through once', async () => {
  const alexa = fakeAlexa();
  await withServer({ alexa }, async (call, logs) => {
    const res = await call('POST', '/speak', { body: { targets: ['A1', 'B2'], text: ' Door  open ' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true, mode: 'announcement', targets: 2 });
    assert.deepEqual(alexa.calls, [{ targets: ['A1', 'B2'], text: 'Door open' }]);
    assert.ok(logs.every((l) => !l.includes('Door')), 'message text must not be logged');
  });
});

test('inbound rate limit returns 429 with Retry-After', async () => {
  const alexa = fakeAlexa();
  const limiter = new RateLimiter({ perMinute: 1, burst: 2, now: () => 1000 });
  await withServer({ alexa, limiter }, async (call) => {
    const body = { targets: ['A1'], text: 'hi' };
    assert.equal((await call('POST', '/speak', { body })).status, 200);
    assert.equal((await call('POST', '/speak', { body })).status, 200);
    const res = await call('POST', '/speak', { body });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal(alexa.calls.length, 2);
  });
});

test('Amazon throttling starts a cooldown and is never retried', async () => {
  let attempts = 0;
  const alexa = fakeAlexa({
    speak: async () => {
      attempts += 1;
      throw new BridgeError(429, 'amazon_throttled', 'Amazon is rate limiting requests');
    },
  });
  await withServer({ alexa, env: { RATE_LIMIT_BURST: '5' } }, async (call) => {
    const first = await call('POST', '/speak', { body: { targets: ['A1', 'B2'], text: 'hi' } });
    assert.equal(first.status, 429);
    assert.equal(first.headers.get('retry-after'), '60');
    const second = await call('POST', '/speak', { body: { targets: ['A1'], text: 'hi' } });
    assert.equal(second.status, 429);
    assert.equal(attempts, 1, 'cooldown must block further Amazon calls');
  });
});

test('unexpected errors return a generic message', async () => {
  const alexa = fakeAlexa({ speak: async () => { throw new Error('cookie=SECRET leaked'); } });
  await withServer({ alexa }, async (call, logs) => {
    const res = await call('POST', '/speak', { body: { targets: ['A1'], text: 'hi' } });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('SECRET'));
    assert.ok(logs.every((l) => !l.includes('SECRET')));
  });
});

test('unknown routes return 404', async () => {
  await withServer({ alexa: fakeAlexa() }, async (call) => {
    assert.equal((await call('GET', '/cookieData')).status, 404);
  });
});
