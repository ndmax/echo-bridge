// Offline tests for `npm run login`. No browser login happens, so Amazon is never contacted;
// a real sign-in (and 2FA) can only be verified by the user.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loginOptions, runLogin } from '../src/login.js';

const TOKEN = 't'.repeat(40);

async function tempConfig(env = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'echo-bridge-login-'));
  const config = loadConfig({
    BRIDGE_TOKEN: TOKEN, LOGIN_PROXY_IP: '192.168.1.20', COOKIE_FILE: join(dir, 'data', 'alexa-cookie.json'), ...env,
  });
  return { dir, config };
}

// Emulates alexa-remote2's proxy-mode init(): first the "Please open" callback, then success.
function fakeRemote({ cookieData, fail = false }) {
  const remote = new EventEmitter();
  remote.serialNumbers = { A1: {}, B2: {} };
  remote.stopped = 0;
  remote.stopProxyServer = () => { remote.stopped += 1; };
  remote.init = (options, callback) => {
    remote.options = options;
    callback(new Error('Please open http://192.168.1.20:3457/ with your browser and login to Amazon.'));
    setImmediate(() => {
      if (fail) return callback(new Error('Cookie invalid'));
      remote.cookieData = cookieData;
      callback();
    });
  };
  return remote;
}

test('login options use the proxy-only flow with no logger and US English', async () => {
  const { config, dir } = await tempConfig();
  const options = loginOptions(config);
  assert.equal(options.setupProxy, true);
  assert.equal(options.proxyOnly, true);
  assert.equal(options.proxyOwnIp, '192.168.1.20');
  assert.equal(options.proxyPort, 3457);
  assert.equal(options.proxyListenBind, '0.0.0.0');
  assert.equal(options.amazonPageProxyLanguage, 'en_US');
  assert.equal(options.logger, undefined);
  assert.equal(options.email, undefined);
  assert.equal(options.password, undefined);
  assert.ok(options.formerDataStorePath.startsWith(join(dir, 'data')));
  await rm(dir, { recursive: true });
});

test('successful login saves the session with owner-only permissions and prints no secrets', async () => {
  const { config, dir } = await tempConfig();
  const cookieData = { localCookie: 'session-id=SECRET; csrf=abc', csrf: 'abc', refreshToken: 'Atnr|SECRET' };
  const remote = fakeRemote({ cookieData });
  const printed = [];
  const count = await runLogin({ config, remote, print: (line) => printed.push(line) });

  assert.equal(count, 2);
  assert.deepEqual(JSON.parse(await readFile(config.cookieFile, 'utf8')), cookieData);
  assert.equal((await stat(config.cookieFile)).mode & 0o777, 0o600);
  assert.equal((await stat(join(dir, 'data'))).mode & 0o777, 0o700);
  assert.ok(printed[0].includes('http://192.168.1.20:3457/'));
  assert.ok(printed.every((line) => !line.includes('SECRET')));
  assert.equal(remote.stopped, 1, 'proxy must be stopped after login');
  await rm(dir, { recursive: true });
});

test('failed login reports a generic error and writes nothing', async () => {
  const { config, dir } = await tempConfig();
  const remote = fakeRemote({ fail: true });
  await assert.rejects(runLogin({ config, remote, print: () => {} }), /Amazon login failed/);
  await assert.rejects(stat(config.cookieFile));
  assert.equal(remote.stopped, 1);
  await rm(dir, { recursive: true });
});

test('login requires LOGIN_PROXY_IP', async () => {
  const { config, dir } = await tempConfig({ LOGIN_PROXY_IP: '' });
  await assert.rejects(runLogin({ config, remote: fakeRemote({}) }), /LOGIN_PROXY_IP/);
  await rm(dir, { recursive: true });
});

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

test('real alexa-cookie2 proxy starts on the configured bind/port, then times out and closes', async () => {
  const outbound = mock.method(https, 'request', () => { throw new Error('unexpected outbound request'); });
  const { config, dir } = await tempConfig({ LOGIN_PROXY_IP: '127.0.0.1', LOGIN_PROXY_BIND: '127.0.0.1', LOGIN_PROXY_PORT: '34571' });
  const printed = [];
  const login = runLogin({ config, print: (line) => printed.push(line), timeoutMs: 1500 });

  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(printed[0]?.includes('http://127.0.0.1:34571/'), 'prints the proxy URL');
  assert.equal(await portIsOpen(34571), true, 'proxy listens while login is pending');

  await assert.rejects(login, /not completed within/);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await portIsOpen(34571), false, 'proxy is closed after the timeout');
  assert.equal(outbound.mock.callCount(), 0, 'starting the proxy must not contact Amazon');
  // alexa-cookie2 writes its device-registration data to our data dir, not into node_modules.
  await stat(join(dir, 'data', 'alexa-former-data.json'));
  outbound.mock.restore();
  await rm(dir, { recursive: true });
});
