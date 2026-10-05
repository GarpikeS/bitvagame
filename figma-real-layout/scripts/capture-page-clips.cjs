const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:5175/';
const PORT = Number(process.env.QA_CDP_PORT || 9350);
const WIDTH = Number(process.env.QA_WIDTH || 1366);
const HEIGHT = Number(process.env.QA_HEIGHT || 900);
const OUT_DIR = process.env.QA_OUT_DIR
  ? path.resolve(ROOT, process.env.QA_OUT_DIR)
  : path.join(ROOT, 'qa', 'page-clips');
const ALL_FAVORITES = ['royal', 'karaoke', 'mafia', 'musical'];
const GAME_DETAIL_FAVORITES = ['royal', 'karaoke', 'musical'];

const routes = [
  ['', 'home', false],
  ['#/logged-in-home', 'logged-in-home', true],
  ['#/profile', 'profile', true],
  ['#/favorites', 'favorites', true],
  ['#/purchases', 'purchases', true],
  ['#/forms', 'forms', true],
  ['#/login', 'login', false],
  ['#/login-code', 'login-code', false],
  ['#/recovery-code', 'recovery-code', false],
  ['#/new-password', 'new-password', false],
  ['#/register', 'register', false],
  ['#/register-email-exists', 'register-email-exists', false],
  ['#/register-code', 'register-code', false],
  ['#/register-success', 'register-success', true],
  ['#/auth-register-success', 'auth-register-success', true],
  ['#/auth-login-success', 'auth-login-success', true],
  ['#/privacy', 'privacy', false],
  ['#/game-detail', 'game-detail', true, GAME_DETAIL_FAVORITES],
];
const routeFilter = new Set(
  String(process.env.QA_ROUTES || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean),
);
const activeRoutes = routeFilter.size
  ? routes.filter(([, slug]) => routeFilter.has(slug))
  : routes;

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Chrome/Edge executable not found. Set CHROME_PATH.');
  return found;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function launchChrome() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = path.join(os.tmpdir(), `bitva-page-clips-${Date.now()}`);
  const child = spawn(chromePath(), [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--mute-audio',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    stdio: 'ignore',
    detached: false,
  });
  return child;
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${PORT}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

async function newTarget() {
  const url = `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`;
  try {
    return await fetchJson(url, { method: 'PUT' });
  } catch {
    return fetchJson(url);
  }
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = seq++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        once(method) {
          return new Promise((res) => listeners.set(method, res));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result || {});
        return;
      }
      if (message.method && listeners.has(message.method)) {
        const listener = listeners.get(message.method);
        listeners.delete(message.method);
        listener(message.params || {});
      }
    });

    ws.addEventListener('error', reject);
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function navigate(cdp, hash) {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE_URL}${hash}` });
  await Promise.race([loaded, sleep(1000)]).catch(() => {});
  await sleep(650);
}

function cacheBustedRoute(hash) {
  return `?qaClip=${Date.now()}-${Math.random().toString(36).slice(2)}${hash}`;
}

async function setAppStorage(cdp, loggedIn, favoriteIds = ALL_FAVORITES) {
  const favoriteJson = JSON.stringify(favoriteIds);
  const purchasedBlanks = JSON.stringify([
    { id: 'qa-older-1', category: 'Хиты караоке', count: 3, date: '01.05.2026' },
    { id: 'qa-older-2', category: 'Любимые хиты', count: 4, date: '03.05.2026' },
    { id: 'qa-hits', category: 'Хиты 90-х', count: 12, date: '06.05.2026' },
    { id: 'qa-devichnik', category: 'Девичник', count: 6, date: '06.05.2026' },
  ]);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    if (${loggedIn ? 'true' : 'false'}) {
      localStorage.setItem('bitva_logged_in', '1');
      localStorage.setItem('bitva_balance', '11240');
      localStorage.setItem('bitva_name', 'Тимур');
      localStorage.setItem('bitva_favorites', ${JSON.stringify(favoriteJson)});
      localStorage.setItem('bitva_purchased_blanks', ${JSON.stringify(purchasedBlanks)});
    } else {
      localStorage.setItem('bitva_logged_in', '0');
    }
    return true;
  })()`);
}

async function captureRoute(cdp, hash, slug, loggedIn, favoriteIds) {
  await navigate(cdp, '');
  await setAppStorage(cdp, loggedIn, favoriteIds);
  await navigate(cdp, cacheBustedRoute(hash));
  await evaluate(cdp, `(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode?.().catch(() => undefined)),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);

  const rect = await evaluate(cdp, `(() => {
    const page = document.querySelector('.page');
    if (!page) return null;
    const box = page.getBoundingClientRect();
    return {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
      route: location.hash || '#/home',
      cls: page.className,
      logged: localStorage.getItem('bitva_logged_in'),
      hasDetailAccount: Boolean(document.querySelector('.detail-account')),
      hasCloseUser: Boolean(document.querySelector('.close-user')),
    };
  })()`);
  if (!rect) throw new Error(`${slug}: .page not found`);

  const clip = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    scale: 1,
  };

  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip,
  });

  const filePath = path.join(OUT_DIR, `${slug}.png`);
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return {
    slug,
    path: path.relative(ROOT, filePath),
    clip,
    route: rect.route,
    className: rect.cls,
    state: {
      logged: rect.logged,
      hasDetailAccount: rect.hasDetailAccount,
      hasCloseUser: rect.hasCloseUser,
    },
  };
}

async function main() {
  const chrome = launchChrome();
  let cdp;
  try {
    await waitForChrome();
    const target = await newTarget();
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const captures = [];
    for (const route of activeRoutes) {
      captures.push(await captureRoute(cdp, ...route));
    }

    const reportPath = path.join(OUT_DIR, 'report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify({ baseUrl: BASE_URL, viewport: { width: WIDTH, height: HEIGHT }, captures }, null, 2)}\n`);
    console.log(JSON.stringify(captures, null, 2));
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
