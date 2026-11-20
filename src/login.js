// One-time Amazon login: `npm run login`.
//
// Uses alexa-remote2's supported proxy flow (alexa-cookie2). The proxy serves Amazon's own
// sign-in pages (including 2FA) to your browser; our code never sees or stores the password.
// The proxy is plain HTTP on the LAN (alexa-cookie2 hard-codes http://), runs only while this
// command runs, and shuts down after success or LOGIN_TIMEOUT_MINUTES.
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AlexaRemote from 'alexa-remote2';
import { loadConfig } from './config.js';

const LOGIN_TIMEOUT_MINUTES = 10;

export function loginOptions(config) {
  return {
    setupProxy: true,
    proxyOnly: true, // never attempt a scripted email/password login
    proxyOwnIp: config.loginProxyIp,
    proxyPort: config.loginProxyPort,
    proxyListenBind: config.loginProxyBind,
    amazonPage: config.amazonPage,
    acceptLanguage: config.alexaLocale,
    amazonPageProxyLanguage: config.alexaLocale.replace('-', '_'), // library default is de_DE
    // Keep alexa-cookie2's device-registration data next to the session, not inside node_modules.
    formerDataStorePath: join(dirname(config.cookieFile), 'alexa-former-data.json'),
    cookieRefreshInterval: 0, // this process exits after login; the bridge handles refreshes
    useWsMqtt: false,
    usePushConnection: false,
    bluetooth: false,
    notifications: false,
    // Deliberately no logger: alexa-cookie2 logs request headers, including cookies.
  };
}

async function saveSession(cookieFile, cookieData) {
  await writeFile(cookieFile, JSON.stringify(cookieData), { mode: 0o600 });
  await chmod(cookieFile, 0o600); // writeFile's mode only applies when creating the file
}

// Resolves with the number of devices found. Prints only the proxy URL and outcomes.
export async function runLogin({ config, remote = new AlexaRemote(), print = console.log, timeoutMs = LOGIN_TIMEOUT_MINUTES * 60_000 }) {
  if (!config.loginProxyIp) {
    throw new Error('Set LOGIN_PROXY_IP to the LAN address your browser uses to reach this machine');
  }
  // Must exist before init(): alexa-cookie2 writes its registration data here and silently
  // ignores write errors.
  await mkdir(dirname(config.cookieFile), { recursive: true, mode: 0o700 });
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      remote.stopProxyServer?.();
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`login not completed within ${LOGIN_TIMEOUT_MINUTES} minutes`)), timeoutMs);

    // init() calls back twice in proxy mode: first with a "Please open http://..." error that
    // carries the proxy URL, then with no error once the browser login has completed.
    remote.init(loginOptions(config), (err) => {
      if (err && /Please open http/.test(err.message)) {
        print(`Open http://${config.loginProxyIp}:${config.loginProxyPort}/ in a browser on your LAN and sign in to Amazon.`);
        print(`Waiting up to ${LOGIN_TIMEOUT_MINUTES} minutes...`);
        return;
      }
      if (err) return finish(new Error('Amazon login failed; run the command again'));
      if (!remote.cookieData) return finish(new Error('login finished but no session data was returned'));
      saveSession(config.cookieFile, remote.cookieData)
        .then(() => finish(null, Object.keys(remote.serialNumbers || {}).length))
        .catch(() => finish(new Error('could not write COOKIE_FILE')));
    });
  });
}

async function main() {
  const config = loadConfig();
  const deviceCount = await runLogin({ config });
  console.log(`Login complete. Session saved to ${config.cookieFile}; ${deviceCount} Alexa devices found.`);
  console.log('Restart the bridge so it loads the new session.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then(() => process.exit(0), (err) => {
    console.error(err.message);
    process.exit(1);
  });
}
