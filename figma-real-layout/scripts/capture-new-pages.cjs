const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:5175/';
const PORT = Number(process.env.QA_CDP_PORT || 9444);
const WIDTH = Number(process.env.QA_WIDTH || 1366);
const HEIGHT = Number(process.env.QA_HEIGHT || 900);
const OUT_DIR = process.env.QA_OUT_DIR
  ? path.resolve(ROOT, process.env.QA_OUT_DIR)
  : path.join(ROOT, 'qa', 'new-pages');
const PROFILE_NAME = '\u0422\u0438\u043c\u0443\u0440';
const MOCK_AUTH_SESSION = process.env.QA_MOCK_AUTH_SESSION === '1';
let mockSessionUser = null;

const captures = [
  { hash: '#/karaoke-detail', slug: 'layout4-karaoke-detail', balance: 11240, withBlanks: true },
  { hash: '#/karaoke-categories', slug: 'layout4-categories', balance: 11240, withBlanks: true },
  { hash: '#/karaoke-category-purchase', slug: 'layout4-category-purchase', balance: 0, withBlanks: true },
  { hash: '#/karaoke-category-purchase', slug: 'layout4-category-purchase-funded', balance: 11240, withBlanks: true },
  { hash: '#/karaoke-category-success', slug: 'layout4-category-success', balance: 11240, withBlanks: true },
  {
    hash: '#/karaoke-correct-answers',
    slug: 'layout4-correct-answers',
    balance: 11240,
    withBlanks: true,
    playedIndexes: [0, 1, 2],
    musicCategory: 'Девичник',
  },
  { hash: '#/music-detail', slug: 'music-detail', balance: 11240, withBlanks: true },
  { hash: '#/music-buy-blanks', slug: 'music-buy-blanks', balance: 11240, withBlanks: false },
  {
    hash: '#/music-blanks',
    slug: 'music-blanks',
    balance: 11240,
    blanks: [
      { id: 'qa-devichnik', category: 'Девичник', count: 6, date: '06.05.2026' },
      { id: 'qa-hits', category: 'Хиты 90-х', count: 12, date: '06.05.2026' },
    ],
  },
  { hash: '#/karaoke-splash', slug: 'karaoke-splash', balance: 11240, withBlanks: true },
  {
    hash: '#/music-game',
    slug: 'music-game-empty',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Девичник', count: 4, date: '06.05.2026' }],
    playedIndexes: Array.from({ length: 14 }, (_, index) => index),
  },
  {
    hash: '#/music-game',
    slug: 'music-game-selected-karaoke',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    playedIndexes: Array.from({ length: 14 }, (_, index) => index),
    musicCategory: 'Хиты караоке',
    showCategoryCover: true,
  },
  {
    hash: '#/music-game',
    slug: 'music-game-active-song',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    playedIndexes: Array.from({ length: 14 }, (_, index) => index),
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
  },
  {
    hash: '#/music-game',
    slug: 'layout4-song-paused',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
    paused: true,
  },
  {
    hash: '#/music-game',
    slug: 'layout4-song-finished',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
    finished: true,
  },
  {
    hash: '#/music-game',
    slug: 'layout4-correct-lyrics',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
    finished: true,
    showCorrectWords: true,
  },
  {
    hash: '#/music-game',
    slug: 'layout4-song-fullscreen-wide',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    playedIndexes: Array.from({ length: 14 }, (_, index) => index),
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
    fullscreen: true,
  },
  {
    hash: '#/music-game',
    slug: 'layout4-song-fullscreen-wide-paused',
    balance: 11240,
    blanks: [{ id: 'qa-game-blanks', category: 'Хиты караоке', count: 1, date: '06.05.2026' }],
    musicCategory: 'Хиты караоке',
    waitForSongArtwork: true,
    fullscreen: true,
    paused: true,
  },
  {
    hash: '#/music-songs',
    slug: 'music-game-playing-short',
    balance: 11240,
    withBlanks: true,
    playedIndexes: [10, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  {
    hash: '#/music-new-game',
    slug: 'music-new-game-category',
    balance: 11240,
    withBlanks: true,
    playedIndexes: Array.from({ length: 14 }, (_, index) => index),
    musicCategory: 'Хиты караоке',
  },
  { hash: '#/music-winner', slug: 'music-winner-select', balance: 11240, withBlanks: true },
  { hash: '#/buy-blanks', slug: 'buy-blanks-no-coins', balance: 0 },
  { hash: '#/balance-top-up', slug: 'balance-top-up', balance: 0 },
  { hash: '#/register-success', slug: 'buy-blanks-success', balance: 100, withBlanks: true },
  { hash: '#/auth-register-success', slug: 'auth-register-success-default', balance: 100, authIntent: 'default' },
  { hash: '#/auth-register-success', slug: 'auth-register-success-purchase', balance: 100, authIntent: 'purchase' },
  { hash: '#/auth-login-success', slug: 'auth-login-success-play', balance: 100, authIntent: 'play', withBlanks: true },
  { hash: '#/auth-login-success', slug: 'auth-login-success-no-blanks', balance: 100, authIntent: 'play', withBlanks: false },
];
const captureFilter = new Set(
  String(process.env.QA_CAPTURES || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean),
);
const activeCaptures = captureFilter.size
  ? captures.filter((item) => captureFilter.has(item.slug))
  : captures;

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
  const userDataDir = path.join(os.tmpdir(), `bitva-new-pages-${Date.now()}`);
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-quic',
    '--mute-audio',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (process.env.QA_HOST_RESOLVER_RULES) {
    args.push(`--host-resolver-rules=${process.env.QA_HOST_RESOLVER_RULES}`);
  }
  args.push('about:blank');
  return spawn(chromePath(), args, { stdio: 'ignore', detached: false });
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
    const subscriptions = new Map();

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
        on(method, listener) {
          const callbacks = subscriptions.get(method) || new Set();
          callbacks.add(listener);
          subscriptions.set(method, callbacks);
          return () => callbacks.delete(listener);
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
      if (message.method && subscriptions.has(message.method)) {
        subscriptions.get(message.method).forEach((listener) => listener(message.params || {}));
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

async function navigate(cdp, url) {
  const expectedOrigin = new URL(url).origin;
  const result = await cdp.send('Page.navigate', { url });
  if (result.errorText) throw new Error(`Navigation failed for ${url}: ${result.errorText}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(150);
    try {
      const state = await evaluate(cdp, `({
        origin: location.origin,
        href: location.href,
        readyState: document.readyState,
      })`);
      if (state.origin === expectedOrigin && state.readyState === 'complete') {
        await sleep(250);
        return;
      }
    } catch {
      // The execution context is briefly unavailable while the page commits.
    }
  }

  throw new Error(`Navigation timed out for ${url}`);
}

async function waitForPage(cdp, slug) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if (await evaluate(cdp, `Boolean(document.querySelector('.page'))`)) return;
    } catch {
      // The execution context can be replaced while a redirect settles.
    }
    await sleep(150);
  }
  throw new Error(`${slug}: .page not found after waiting for React mount`);
}

async function waitForImages(cdp) {
  await evaluate(cdp, `(() => Promise.all(Array.from(document.images).map((img) => {
    if (img.complete && img.naturalWidth > 0) return true;
    return new Promise((resolve) => {
      img.addEventListener('load', () => resolve(true), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  })))()`);
  await sleep(150);
}

async function waitForSongArtwork(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(cdp, `(() => {
      const image = document.querySelector('.music-current-art');
      return Boolean(image && image.complete && image.naturalWidth > 0);
    })()`);
    if (ready) {
      await sleep(250);
      return;
    }
    await sleep(150);
  }
  throw new Error('music-current-art did not finish loading');
}

async function prepareStorage(
  cdp,
  balance,
  authIntent = 'default',
  withBlanks = true,
  blanks,
  playedIndexes = [],
  musicCategory = '',
  showCategoryCover = false,
  musicSongIndex = 0,
) {
  mockSessionUser = {
    id: 'qa-user',
    name: PROFILE_NAME,
    email: 'timur@example.test',
    balanceCoins: Number(balance) || 0,
  };
  const purchasedBlanks = Array.isArray(blanks)
    ? blanks
    : withBlanks
      ? [{ id: 'qa-blank', category: 'Девичник', count: 2, date: '10.07.2026' }]
      : [];
  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '1');
    localStorage.setItem('bitva_balance', '${balance}');
    localStorage.setItem('bitva_name', ${JSON.stringify(PROFILE_NAME)});
    localStorage.setItem('bitva_auth_intent', ${JSON.stringify(authIntent)});
    localStorage.setItem('bitva_favorites', JSON.stringify(['royal', 'karaoke', 'mafia', 'musical']));
    localStorage.setItem('bitva_purchased_blanks', JSON.stringify(${JSON.stringify(purchasedBlanks)}));
    localStorage.setItem('bitva_music_played_indexes', JSON.stringify(${JSON.stringify(playedIndexes)}));
    localStorage.setItem('bitva_music_category', ${JSON.stringify(musicCategory)});
    localStorage.setItem('bitva_music_show_category_cover', ${showCategoryCover ? "'1'" : "'0'"});
    localStorage.setItem('bitva_music_song_index', ${JSON.stringify(String(musicSongIndex))});
    return true;
  })()`);
}

async function prepareGuestStorage(cdp) {
  mockSessionUser = null;
  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
    return true;
  })()`);
}

async function capturePage(cdp, item) {
  await prepareStorage(
    cdp,
    item.balance,
    item.authIntent,
    item.withBlanks,
    item.blanks,
    item.playedIndexes,
    item.musicCategory,
    item.showCategoryCover,
    item.musicSongIndex,
  );
  await navigate(cdp, `${BASE_URL}?qaNew=${Date.now()}-${Math.random().toString(36).slice(2)}${item.hash}`);
  await waitForPage(cdp, item.slug);
  await waitForImages(cdp);
  if (item.waitForSongArtwork) {
    await waitForSongArtwork(cdp);
  }
  if (item.fullscreen) {
    await evaluate(cdp, `document.querySelector('.music-share')?.click(); true`);
    await sleep(220);
  }
  if (item.paused) {
    await evaluate(cdp, `document.querySelector('.music-pause')?.click(); true`);
    await sleep(120);
  }
  if (item.finished) {
    await evaluate(cdp, `document.querySelector('.music-audio')?.dispatchEvent(new Event('ended')); true`);
    await sleep(120);
  }
  if (item.showCorrectWords) {
    await evaluate(cdp, `document.querySelector('.music-correct-toggle')?.click(); true`);
    await sleep(120);
  }
  if (Number.isInteger(item.selectCategoryIndex)) {
    await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
    await sleep(120);
    await evaluate(
      cdp,
      `document.querySelectorAll('.music-category-dropdown button')[${item.selectCategoryIndex}]?.click(); true`,
    );
    await sleep(180);
    await waitForImages(cdp);
  }
  const captureSelector = item.fullscreen ? '.music-current-card.is-fullscreen' : '.page';
  const rect = await evaluate(cdp, `(() => {
    const page = document.querySelector(${JSON.stringify(captureSelector)});
    if (!page) return null;
    const box = page.getBoundingClientRect();
    return {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
      left: box.left,
      right: box.right,
      cls: page.className,
      hash: location.hash,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      balanceText: document.querySelector('.detail-account .balance-badge strong')?.textContent || '',
    };
  })()`);
  if (!rect) throw new Error(`${item.slug}: .page not found`);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      scale: 1,
    },
  });
  const filePath = path.join(OUT_DIR, `${item.slug}.png`);
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return { slug: item.slug, path: path.relative(ROOT, filePath), rect };
}

async function visibleTapIssues(cdp) {
  return evaluate(cdp, `(() => Array.from(document.querySelectorAll('button, input, a')).map((el) => {
    const r = el.getBoundingClientRect();
    const scaleX = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    const scaleY = el.offsetHeight > 0 ? r.height / el.offsetHeight : 1;
    const effective = ['::before', '::after'].reduce((size, pseudo) => {
      const style = getComputedStyle(el, pseudo);
      if (
        style.content === 'none'
        || style.display === 'none'
        || style.position !== 'absolute'
        || style.pointerEvents === 'none'
      ) return size;
      const left = Number.parseFloat(style.left);
      const right = Number.parseFloat(style.right);
      const top = Number.parseFloat(style.top);
      const bottom = Number.parseFloat(style.bottom);
      return {
        width: Math.max(size.width, r.width + Math.max(0, -left) * scaleX + Math.max(0, -right) * scaleX),
        height: Math.max(size.height, r.height + Math.max(0, -top) * scaleY + Math.max(0, -bottom) * scaleY),
      };
    }, { width: r.width, height: r.height });
    return {
      tag: el.tagName,
      cls: typeof el.className === 'string' ? el.className : '',
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      width: Math.round(r.width),
      height: Math.round(r.height),
      effectiveWidth: Math.round(effective.width),
      effectiveHeight: Math.round(effective.height),
      visible: r.width > 0 && r.height > 0,
      inViewport: r.bottom >= 0 && r.top <= innerHeight && r.right >= 0 && r.left <= innerWidth,
      inlineTextLink: el.matches('.music-feature-copy a'),
    };
  }).filter((item) => item.visible && item.inViewport && !item.inlineTextLink && (item.effectiveWidth < 32 || item.effectiveHeight < 32)))()`);
}

async function chooseMusicCategoryAndStart(cdp, categoryIndex = 0) {
  await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
  await sleep(120);
  await evaluate(cdp, `document.querySelectorAll('.music-category-dropdown button')[${categoryIndex}]?.click(); true`);
  await sleep(180);
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(180);
}

async function getInteractionPoint(cdp, selector) {
  const serializedSelector = JSON.stringify(selector);
  await evaluate(cdp, `(() => {
    const element = document.querySelector(${serializedSelector});
    element?.scrollIntoView({ block: 'center', inline: 'center' });
    return true;
  })()`);
  await sleep(100);
  const point = await evaluate(cdp, `(() => {
    const element = document.querySelector(${serializedSelector});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      width: rect.width,
      height: rect.height,
      hitMatches: hit === element || element.contains(hit),
      hitTag: hit?.tagName || '',
      hitClass: typeof hit?.className === 'string' ? hit.className : '',
    };
  })()`);
  if (!point) throw new Error(`Interactive element not found: ${selector}`);
  return point;
}

async function clickElementAtCenter(cdp, selector) {
  const point = await getInteractionPoint(cdp, selector);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  return point;
}

async function activateElementWithEnter(cdp, selector) {
  const point = await getInteractionPoint(cdp, selector);
  const serializedSelector = JSON.stringify(selector);
  await evaluate(cdp, `document.querySelector(${serializedSelector})?.focus(); true`);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  return point;
}

async function runChecks(cdp) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
  const appMusicSource = ['src/main.jsx', 'src/styles.css']
    .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n');
  const requiredInlinePlaceholderTokens = [
    ['music', 'game', 'placeholder'].join('-'),
    ['music-game-page', ['is', 'empty'].join('-')].join('.'),
    'musicGameEmptySheet',
  ];
  add(
    'inline category placeholder is restored without the retired list controls',
    requiredInlinePlaceholderTokens.every((token) => appMusicSource.includes(token))
      && !appMusicSource.includes(['music', 'game', 'control', 'list'].join('-')),
    JSON.stringify({
      missing: requiredInlinePlaceholderTokens.filter((token) => !appMusicSource.includes(token)),
      retiredListPresent: appMusicSource.includes(['music', 'game', 'control', 'list'].join('-')),
    }),
  );

  for (const item of activeCaptures) {
    await prepareStorage(
      cdp,
      item.balance,
      item.authIntent,
      item.withBlanks,
      item.blanks,
      item.playedIndexes,
      item.musicCategory,
      item.showCategoryCover,
    );
    await navigate(cdp, `${BASE_URL}?qaCheck=${Date.now()}${item.hash}`);
    const layout = await evaluate(cdp, `(() => {
      const page = document.querySelector('.page');
      const box = page?.getBoundingClientRect();
      return {
        width: box?.width || 0,
        left: box?.left || 0,
        right: box?.right || 0,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    })()`);
    add(`${item.slug} centered/no overflow`, layout.scrollWidth <= layout.clientWidth + 1 && layout.left >= 0 && layout.right <= layout.clientWidth + 1, JSON.stringify(layout));
    const routeMaxWidth = 540;
    const expectedPageWidth = Math.min(layout.clientWidth, routeMaxWidth);
    add(`${item.slug} keeps its original page width`, Math.abs(layout.width - expectedPageWidth) <= 1, JSON.stringify({ ...layout, expectedPageWidth }));
    const taps = await visibleTapIssues(cdp);
    add(`${item.slug} tap areas >=32px`, taps.length === 0, JSON.stringify(taps));
    if (item.slug === 'buy-blanks-success' || item.slug.startsWith('auth-register-success')) {
      const confettiBackground = await evaluate(cdp, `getComputedStyle(document.querySelector('.auth-page'), '::before').backgroundImage`);
      add(`${item.slug} shows confetti with Ura`, confettiBackground !== 'none', confettiBackground);
    }
    if (item.slug.startsWith('auth-login-success')) {
      const confettiBackground = await evaluate(cdp, `getComputedStyle(document.querySelector('.auth-page'), '::before').backgroundImage`);
      add(`${item.slug} has no confetti without Ura`, confettiBackground === 'none', confettiBackground);
    }
  }

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaMobileSearch=${Date.now()}#/`);
  const mobileSearchBefore = await evaluate(cdp, `(() => {
    const page = document.querySelector('.page');
    const stage = document.querySelector('.responsive-canvas');
    const input = document.querySelector('.search input');
    const box = page?.getBoundingClientRect();
    return {
      left: box?.left || 0,
      top: box?.top || 0,
      width: box?.width || 0,
      scale: stage ? getComputedStyle(stage).getPropertyValue('--canvas-scale').trim() : '',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
      visualWidth: window.visualViewport?.width || 0,
      visualScale: window.visualViewport?.scale || 1,
    };
  })()`);
  await evaluate(cdp, `document.querySelector('.search input')?.focus(); true`);
  await cdp.send('Input.insertText', { text: 'мафия' });
  let visualViewportSimulation;
  try {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
    visualViewportSimulation = { simulated: true, pageScaleFactor: 1.25 };
  } catch (error) {
    visualViewportSimulation = { simulated: false, reason: String(error) };
  }
  await sleep(150);
  const mobileSearchAfter = await evaluate(cdp, `(() => {
    const page = document.querySelector('.page');
    const stage = document.querySelector('.responsive-canvas');
    const input = document.querySelector('.search input');
    const box = page?.getBoundingClientRect();
    return {
      left: box?.left || 0,
      top: box?.top || 0,
      width: box?.width || 0,
      scale: stage ? getComputedStyle(stage).getPropertyValue('--canvas-scale').trim() : '',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      value: input?.value || '',
      visualWidth: window.visualViewport?.width || 0,
      visualScale: window.visualViewport?.scale || 1,
    };
  })()`);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await sleep(100);
  add(
    'mobile search keeps the canvas fixed while the visual viewport resizes',
    visualViewportSimulation.simulated
      && (WIDTH > 540 || mobileSearchAfter.visualWidth < mobileSearchBefore.visualWidth - 1)
      && Math.abs(mobileSearchAfter.left - mobileSearchBefore.left) <= 0.5
      && Math.abs(mobileSearchAfter.top - mobileSearchBefore.top) <= 0.5
      && Math.abs(mobileSearchAfter.width - mobileSearchBefore.width) <= 0.5
      && mobileSearchAfter.scale === mobileSearchBefore.scale
      && mobileSearchAfter.scrollX === mobileSearchBefore.scrollX
      && mobileSearchAfter.scrollY === mobileSearchBefore.scrollY
      && mobileSearchAfter.value === 'мафия',
    JSON.stringify({ before: mobileSearchBefore, after: mobileSearchAfter, visualViewportSimulation }),
  );
  if (WIDTH <= 540) {
    add(
      'mobile search input uses at least 16px text to prevent focus zoom',
      mobileSearchBefore.fontSize >= 16,
      `fontSize=${mobileSearchBefore.fontSize}`,
    );
  }

  await prepareGuestStorage(cdp);
  await navigate(cdp, `${BASE_URL}?qaMafiaCard=${Date.now()}#/`);
  await evaluate(cdp, `document.querySelector('.game-card.is-mafia .game-card-hitbox')?.click(); true`);
  await sleep(250);
  add(
    'home mafia card opens the internal detail page',
    await evaluate(cdp, `location.hash === '#/game-detail' && Boolean(document.querySelector('.game-detail'))`),
    await evaluate(cdp, `location.href`),
  );

  await prepareGuestStorage(cdp);
  await navigate(cdp, `${BASE_URL}?qaPrivacyLink=${Date.now()}#/register`);
  await evaluate(cdp, `(() => {
    window.__qaConsentChanges = 0;
    document.querySelector('.register-page .checkbox input')?.addEventListener('change', () => {
      window.__qaConsentChanges += 1;
    });
    return true;
  })()`);
  await clickElementAtCenter(cdp, '.register-page .checkbox a');
  await sleep(250);
  add(
    'personal data link opens the privacy page without toggling consent',
    await evaluate(cdp, `location.hash === '#/privacy'
      && Boolean(document.querySelector('.privacy-page'))
      && window.__qaConsentChanges === 0`),
    await evaluate(cdp, `JSON.stringify({ hash: location.hash, consentChanges: window.__qaConsentChanges })`),
  );

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaProfileBack=${Date.now()}#/`);
  await evaluate(cdp, `document.querySelector('.account-pill')?.click(); true`);
  await sleep(250);
  add('profile opens from the previous page', await evaluate(cdp, `location.hash === '#/profile' && Boolean(document.querySelector('.profile-page'))`), await evaluate(cdp, `location.hash`));
  add('profile arrow and title are one back control', await evaluate(cdp, `(() => {
    const back = document.querySelector('.profile-page .page-nav-back');
    const arrow = back?.querySelector('.page-nav-back-arrow');
    const title = back?.querySelector('strong');
    const backRect = back?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const titleHit = titleRect
      ? document.elementFromPoint(titleRect.left + titleRect.width / 2, titleRect.top + titleRect.height / 2)
      : null;
    return back?.tagName === 'BUTTON'
      && Boolean(arrow)
      && (title?.textContent || '').trim() === 'Личный кабинет'
      && titleRect.width > 100
      && backRect.width > titleRect.width
      && (titleHit === back || back.contains(titleHit));
  })()`));
  await evaluate(cdp, `document.querySelector('.profile-page .page-nav-back strong')?.click(); true`);
  await sleep(250);
  add('profile title returns to the previous page', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.account-pill')?.click(); true`);
  await sleep(250);
  await evaluate(cdp, `document.querySelector('.profile-page .page-nav-back-arrow')?.click(); true`);
  await sleep(250);
  add('profile arrow returns to the previous page', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  const figmaBackAsset = fs.readFileSync(
    path.join(ROOT, 'public', 'generated', 'header-chevron-left-figma.svg'),
    'utf8',
  );
  add(
    'shared back arrow uses the exact Figma export from Header node 1:885',
    figmaBackAsset.includes('viewBox="0 0 5.05966 8.85373"')
      && figmaBackAsset.includes('fill="#141414"')
      && figmaBackAsset.includes('M3.98002 0.185102'),
    figmaBackAsset,
  );

  const backTitleCases = [
    { name: 'login', route: 'login', page: '.login-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'register', route: 'register', page: '.register-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'registered email', route: 'register-email-exists', page: '.email-exists-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/register', expectedPage: '.register-page' },
    { name: 'registration code', route: 'register-code', page: '.code-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/register', expectedPage: '.register-page' },
    { name: 'login code', route: 'login-code', page: '.code-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/login', expectedPage: '.login-page' },
    { name: 'recovery code', route: 'recovery-code', page: '.code-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/login', expectedPage: '.login-page' },
    { name: 'new password', route: 'new-password', page: '.new-password-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/login', expectedPage: '.login-page' },
    { name: 'privacy', route: 'privacy', page: '.privacy-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'mafia detail', route: 'game-detail', page: '.game-detail', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'music detail', route: 'music-detail', page: '.music-detail-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'music purchase section', route: 'music-buy-blanks', page: '.music-detail-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'karaoke splash', route: 'karaoke-splash', page: '.karaoke-splash-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page' },
    { name: 'music game', route: 'music-game', page: '.music-game-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/music-detail', expectedPage: '.music-detail-page' },
    { name: 'fallen songs', route: 'music-songs', page: '.music-songs-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/music-game', expectedPage: '.music-game-page' },
    { name: 'winner', route: 'music-winner', page: '.music-winner-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/music-game', expectedPage: '.music-game-page' },
    { name: 'music blanks', route: 'music-blanks', page: '.music-blanks-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/music-game', expectedPage: '.music-game-page' },
    { name: 'logged home', route: 'logged-in-home', page: '.logged-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'profile', route: 'profile', page: '.profile-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'favorites', route: 'favorites', page: '.favorites-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'purchases', route: 'purchases', page: '.purchases-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/profile', expectedPage: '.profile-page', loggedIn: true },
    { name: 'forms', route: 'forms', page: '.forms-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/purchases', expectedPage: '.purchases-page', loggedIn: true },
    { name: 'purchase success', route: 'register-success', page: '.register-success-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'registration success', route: 'auth-register-success', page: '.auth-flow-register-success-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'login success', route: 'auth-login-success', page: '.auth-flow-login-success-page', back: '.page-nav-back', arrow: '.page-nav-back-arrow', expectedHash: '#/', expectedPage: '.home-page', loggedIn: true },
    { name: 'buy blanks', route: 'buy-blanks', page: '.buy-blanks-page', back: '.detail-nav-back', arrow: '.detail-nav-back-arrow', expectedHash: '#/music-buy-blanks', expectedPage: '.music-detail-page', loggedIn: true },
    { name: 'payment', route: 'balance-top-up', page: '.balance-top-up-page', back: '.payment-nav-back', arrow: '.payment-nav-back-arrow', expectedHash: '#/buy-blanks', expectedPage: '.buy-blanks-page', loggedIn: true },
  ];
  for (const testCase of backTitleCases) {
    if (testCase.loggedIn) {
      await prepareStorage(cdp, 0);
    } else {
      await prepareGuestStorage(cdp);
    }
    await navigate(cdp, `${BASE_URL}?qaGuestBack=${testCase.route}-${Date.now()}#/${testCase.route}`);
    await evaluate(cdp, `window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); true`);
    await sleep(80);
    const backGeometry = await evaluate(cdp, `(() => {
      const page = document.querySelector(${JSON.stringify(testCase.page)});
      const back = page?.querySelector(${JSON.stringify(testCase.back)});
      const arrow = back?.querySelector(${JSON.stringify(testCase.arrow)});
      const title = back?.querySelector('strong');
      const backRect = back?.getBoundingClientRect();
      const arrowRect = arrow?.getBoundingClientRect();
      const iconRect = arrow?.querySelector('img')?.getBoundingClientRect();
      const arrowStyle = arrow ? getComputedStyle(arrow) : null;
      const circleStyle = arrow ? getComputedStyle(arrow, '::before') : null;
      const sourceArrowWidth = Number.parseFloat(arrowStyle?.width || '0');
      const paintedScale = sourceArrowWidth ? (arrowRect?.width || 0) / sourceArrowWidth : 0;
      const pageRect = page?.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      const titleHit = titleRect
        ? document.elementFromPoint(titleRect.left + titleRect.width / 2, titleRect.top + titleRect.height / 2)
        : null;
      return {
        isButton: back?.tagName === 'BUTTON',
        hasArrow: Boolean(arrow),
        containsTitle: Boolean(title && back?.contains(title)),
        titleHitInside: Boolean(titleHit && (titleHit === back || back?.contains(titleHit))),
        backWidth: backRect?.width || 0,
        titleWidth: titleRect?.width || 0,
        arrowWidth: arrowRect?.width || 0,
        arrowHeight: arrowRect?.height || 0,
        iconWidth: iconRect?.width || 0,
        iconHeight: iconRect?.height || 0,
        circleWidth: Number.parseFloat(circleStyle?.width || '0') * paintedScale,
        circleColor: circleStyle?.backgroundColor || '',
        pageWidth: pageRect?.width || 0,
        gapToTitle: titleRect && arrowRect ? titleRect.left - arrowRect.right : 0,
        iconCenterOffsetX: iconRect && arrowRect
          ? (iconRect.left + iconRect.width / 2) - (arrowRect.left + arrowRect.width / 2)
          : 0,
        iconCenterOffsetY: iconRect && arrowRect
          ? (iconRect.top + iconRect.height / 2) - (arrowRect.top + arrowRect.height / 2)
          : 0,
      };
    })()`);
    add(
      `${testCase.name} arrow and title are one back control`,
      backGeometry.isButton
        && backGeometry.hasArrow
        && backGeometry.containsTitle
        && backGeometry.titleHitInside
        && backGeometry.backWidth >= backGeometry.titleWidth,
      JSON.stringify(backGeometry),
    );
    const figmaBackGeometry = {
      circleWidth: backGeometry.pageWidth * 64 / 1080,
      arrowWidth: backGeometry.pageWidth * 8 / 1080,
      arrowHeight: backGeometry.pageWidth * 14 / 1080,
      gapToTitle: backGeometry.pageWidth * 16 / 1080,
    };
    add(
      `${testCase.name} matches the Figma back arrow geometry from nodes 1:885 and 1:710`,
      Math.abs(backGeometry.arrowWidth - figmaBackGeometry.circleWidth) <= 0.5
        && Math.abs(backGeometry.arrowHeight - figmaBackGeometry.circleWidth) <= 0.5
        && Math.abs(backGeometry.circleWidth - figmaBackGeometry.circleWidth) <= 0.5
        && Math.abs(backGeometry.iconWidth - figmaBackGeometry.arrowWidth) <= 0.5
        && Math.abs(backGeometry.iconHeight - figmaBackGeometry.arrowHeight) <= 0.5
        && Math.abs(backGeometry.gapToTitle - figmaBackGeometry.gapToTitle) <= 0.8
        && Math.abs(backGeometry.iconCenterOffsetX) <= 0.5
        && Math.abs(backGeometry.iconCenterOffsetY) <= 0.5
        && backGeometry.circleColor === 'rgb(229, 229, 229)',
      JSON.stringify({ figma: figmaBackGeometry, actual: backGeometry }),
    );
    await evaluate(cdp, `document.querySelector(${JSON.stringify(`${testCase.page} ${testCase.back} strong`)})?.click(); true`);
    await sleep(250);
    add(
      `${testCase.name} title opens the previous page`,
      await evaluate(
        cdp,
        `location.hash === ${JSON.stringify(testCase.expectedHash)} && Boolean(document.querySelector(${JSON.stringify(testCase.expectedPage)}))`,
      ),
      await evaluate(cdp, `location.hash`),
    );
  }

  if (process.env.QA_BACK_ONLY === '1') return checks;

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaProfileLogo=${Date.now()}#/profile`);
  add('profile logo is a home link', await evaluate(cdp, `(() => {
    const logo = document.querySelector('.profile-page .brand-home-link');
    return logo?.tagName === 'A'
      && logo.getAttribute('href') === '#/'
      && logo.getAttribute('aria-label') === 'На главную';
  })()`));
  await evaluate(cdp, `document.querySelector('.profile-page .brand-home-link')?.click(); true`);
  await sleep(250);
  add('profile logo always opens home', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  await navigate(cdp, `${BASE_URL}?qaAuthLogo=${Date.now()}#/login`);
  await evaluate(cdp, `document.querySelector('.auth-page .brand-home-link')?.click(); true`);
  await sleep(250);
  add('auth logo always opens home', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 0);
  await navigate(cdp, `${BASE_URL}?qaPaymentLogo=${Date.now()}#/balance-top-up`);
  await evaluate(cdp, `document.querySelector('.payment-nav .brand-home-link')?.click(); true`);
  await sleep(250);
  add('payment logo always opens home', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaKaraokeFooterLogo=${Date.now()}#/karaoke-splash`);
  add('karaoke footer logo is a full-size home link', await evaluate(cdp, `(() => {
    const mark = document.querySelector('.karaoke-splash-page .footer-brand-mark');
    const link = mark?.querySelector('.footer-brand-home-link');
    if (!mark || !link || link.getAttribute('href') !== '#/') return false;
    const markRect = mark.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return Math.abs(markRect.width - linkRect.width) <= 1
      && Math.abs(markRect.height - linkRect.height) <= 1
      && linkRect.width > 100
      && linkRect.height > 40;
  })()`));
  await evaluate(cdp, `document.querySelector('.karaoke-splash-page .footer-brand-home-link')?.click(); true`);
  await sleep(250);
  add('karaoke footer logo always opens home', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaAuth=${Date.now()}#/register`);
  add('auth registration uses email and password fields without phone', await evaluate(cdp, `(() => {
    const inputs = Array.from(document.querySelectorAll('.auth-card .auth-input input'));
    const labels = inputs.map((input) => input.getAttribute('aria-label'));
    return inputs.length === 4
      && labels.includes('Электронная почта')
      && labels.includes('Пароль')
      && labels.includes('Подтвердите пароль')
      && !labels.some((label) => /телефон/i.test(label || ''));
  })()`), await evaluate(cdp, `JSON.stringify(Array.from(document.querySelectorAll('.auth-card .auth-input input')).map((input) => input.getAttribute('aria-label')))`));
  await evaluate(cdp, `(() => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setValue(inputs[0], 'Владимир');
    setValue(inputs[1], 'qa-user@example.com');
    setValue(inputs[2], 'qa-password-2026');
    setValue(inputs[3], 'qa-password-2026');
    document.querySelector('.checkbox input')?.click();
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth new registration opens code step', await evaluate(cdp, `location.hash === '#/register-code' || location.hash === '#register-code'`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `(() => {
    document.querySelectorAll('.code-row input').forEach((input, index) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.querySelector('.code-confirm')?.click();
    return true;
  })()`);
  await sleep(500);
  add('auth registration stores normalized email account', await evaluate(cdp, `(() => {
    const accounts = JSON.parse(localStorage.getItem('bitva_accounts') || '[]');
    return accounts.some((account) => account.name === 'Владимир'
      && account.email === 'qa-user@example.com'
      && typeof account.passwordHash === 'string'
      && account.passwordHash.length === 64
      && !account.phone);
  })()`));
  add('auth registration logs in new profile', await evaluate(cdp, `localStorage.getItem('bitva_logged_in') === '1' && localStorage.getItem('bitva_name') === 'Владимир'`));

  await evaluate(cdp, `localStorage.setItem('bitva_logged_in', '0'); true`);
  await navigate(cdp, `${BASE_URL}?qaAuthDuplicate=${Date.now()}#/register`);
  await evaluate(cdp, `(() => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setValue(inputs[0], 'Другой');
    setValue(inputs[1], 'qa-user@example.com');
    setValue(inputs[2], 'another-password-2026');
    setValue(inputs[3], 'another-password-2026');
    document.querySelector('.checkbox input')?.click();
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth duplicate email opens Figma state', await evaluate(cdp, `(location.hash === '#/register-email-exists' || location.hash === '#register-email-exists') && /почта уже зарегистрирована/i.test(document.querySelector('.auth-subtitle')?.textContent || '')`), await evaluate(cdp, `document.querySelector('.auth-subtitle')?.textContent || location.hash`));

  await navigate(cdp, `${BASE_URL}?qaAuthUnknownLogin=${Date.now()}#/login`);
  add('auth login offers registration', await evaluate(cdp, `(() => {
    const button = document.querySelector('.auth-register-action');
    const text = (button?.textContent || '').trim().toLowerCase();
    return button?.tagName === 'BUTTON'
      && button.classList.contains('secondary-wide')
      && text === 'регистрация';
  })()`), await evaluate(cdp, `document.querySelector('.auth-register-action')?.textContent || ''`));
  add('auth registration CTA matches Figma geometry', await evaluate(cdp, `(() => {
    const login = document.querySelector('.login-page .primary-wide');
    const register = document.querySelector('.login-page .auth-register-action');
    if (!login || !register) return false;
    const loginRect = login.getBoundingClientRect();
    const registerRect = register.getBoundingClientRect();
    const style = getComputedStyle(register);
    const gap = registerRect.top - loginRect.bottom;
    const pageWidth = document.querySelector('.login-page')?.getBoundingClientRect().width || 432;
    const canvasScale = pageWidth / 432;
    return Math.abs(loginRect.width - registerRect.width) <= 1
      && registerRect.height >= (47 * canvasScale)
      && Math.abs(gap - (10 * canvasScale)) <= 1
      && style.backgroundColor === 'rgb(255, 255, 255)';
  })()`), await evaluate(cdp, `(() => {
    const login = document.querySelector('.login-page .primary-wide')?.getBoundingClientRect();
    const register = document.querySelector('.login-page .auth-register-action')?.getBoundingClientRect();
    return JSON.stringify({
      login: login && { width: login.width, height: login.height, bottom: login.bottom },
      register: register && { width: register.width, height: register.height, top: register.top },
      gap: login && register ? register.top - login.bottom : null,
      background: getComputedStyle(document.querySelector('.login-page .auth-register-action')).backgroundColor,
    });
  })()`));
  await evaluate(cdp, `document.querySelector('.auth-register-action')?.click(); true`);
  await sleep(250);
  add('auth login registration offer opens registration', await evaluate(cdp, `location.hash === '#/register' || location.hash === '#register'`), await evaluate(cdp, `location.hash`));
  await navigate(cdp, `${BASE_URL}?qaAuthUnknownLoginRetry=${Date.now()}#/login`);
  await evaluate(cdp, `(() => {
    const input = document.querySelector('.auth-card input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'unknown@example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth unknown login email shows account-not-found state', await evaluate(cdp, `(location.hash === '#/login' || location.hash === '#login') && /аккаунт не найден/i.test(document.querySelector('.auth-field-error')?.textContent || '')`), await evaluate(cdp, `document.querySelector('.auth-field-error')?.textContent || location.hash`));

  await navigate(cdp, `${BASE_URL}?qaAuthLogin=${Date.now()}#/login`);
  await evaluate(cdp, `document.querySelectorAll('.auth-mode-toggle button')[1]?.click(); true`);
  await sleep(100);
  await evaluate(cdp, `(() => {
    const input = document.querySelector('.auth-card input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'qa-user@example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth existing email opens login code', await evaluate(cdp, `location.hash === '#/login-code' || location.hash === '#login-code'`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `(() => {
    document.querySelectorAll('.code-row input').forEach((input, index) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.querySelector('.code-confirm')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth existing login restores profile name', await evaluate(cdp, `localStorage.getItem('bitva_logged_in') === '1' && localStorage.getItem('bitva_name') === 'Владимир'`));
  add('auth existing login opens success', await evaluate(cdp, `location.hash === '#/auth-login-success' && Boolean(document.querySelector('.auth-flow-success-page'))`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.auth-flow-success-page .page-nav > button')?.click(); true`);
  await sleep(250);
  add('auth success back exits the auth flow', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page')) && !document.querySelector('.login-page')`), await evaluate(cdp, `location.hash`));

  await evaluate(cdp, `localStorage.setItem('bitva_logged_in', '0'); true`);
  await navigate(cdp, `${BASE_URL}?qaPasswordLogin=${Date.now()}#/login`);
  await evaluate(cdp, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setter.call(inputs[0], 'qa-user@example.com');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], 'qa-password-2026');
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(500);
  add('auth password login opens success', await evaluate(cdp, `location.hash === '#/auth-login-success' && localStorage.getItem('bitva_logged_in') === '1'`), await evaluate(cdp, `location.hash`));

  await evaluate(cdp, `localStorage.setItem('bitva_logged_in', '0'); true`);
  await navigate(cdp, `${BASE_URL}?qaPasswordRecovery=${Date.now()}#/login`);
  await evaluate(cdp, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setter.call(inputs[0], 'qa-user@example.com');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], 'wrong-password');
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(500);
  add('auth wrong password shows Figma error and recovery link', await evaluate(cdp, `/неверный email или пароль/i.test(document.querySelector('.auth-field-error')?.textContent || '') && Boolean(document.querySelector('.auth-recovery-link'))`), await evaluate(cdp, `document.querySelector('.auth-field-error')?.textContent || ''`));
  await evaluate(cdp, `document.querySelector('.auth-recovery-link')?.click(); true`);
  await sleep(250);
  add('auth recovery opens email code step', await evaluate(cdp, `location.hash === '#/recovery-code'`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `(() => {
    document.querySelectorAll('.code-row input').forEach((input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.querySelector('.code-confirm')?.click();
    return true;
  })()`);
  await sleep(250);
  add('auth recovery code opens new password screen', await evaluate(cdp, `location.hash === '#/new-password'`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setter.call(inputs[0], 'updated-password-2026');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], 'updated-password-2026');
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(500);
  add('auth password reset returns to login', await evaluate(cdp, `location.hash === '#/login'`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setter.call(inputs[0], 'qa-user@example.com');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], 'updated-password-2026');
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(500);
  add('auth updated password works', await evaluate(cdp, `location.hash === '#/auth-login-success' && localStorage.getItem('bitva_logged_in') === '1'`), await evaluate(cdp, `location.hash`));

  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaGuestPlay=${Date.now()}#/music-detail`);
  add('music detail has one useful start CTA', await evaluate(cdp, `(() => {
    const buttons = Array.from(document.querySelectorAll('.music-action-pair button'));
    return buttons.length === 1 && /начать игру/i.test(buttons[0].textContent || '') && !/как играть/i.test(document.querySelector('.music-action-pair')?.textContent || '');
  })()`), await evaluate(cdp, `document.querySelector('.music-action-pair')?.textContent || ''`));
  await evaluate(cdp, `document.querySelector('.music-start-game')?.click(); true`);
  await sleep(250);
  add('guest starts music game without registration', await evaluate(cdp, `location.hash === '#/music-game' && Boolean(document.querySelector('.music-game-page')) && !document.querySelector('.login-page')`), await evaluate(cdp, `location.hash`));
  add('guest start opens the inline choose-category placeholder', await evaluate(cdp, `(() => {
    const page = document.querySelector('.music-game-page');
    return location.hash === '#/music-game'
      && localStorage.getItem('bitva_music_category') === ''
      && page?.classList.contains('is-empty')
      && /выберите категорию/i.test(document.querySelector('.music-game-placeholder h2')?.textContent || '')
      && /после выбора категории/i.test(document.querySelector('.music-game-placeholder p')?.textContent || '')
      && /music-game-empty-sheet\\.png$/.test(document.querySelector('.music-game-placeholder img')?.src || '')
      && !document.querySelector('.music-next-song')
      && !document.querySelector('.music-current-card')
      && !document.querySelector('.music-category-cover');
  })()`));
  await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
  await sleep(100);
  await evaluate(cdp, `document.querySelector('.music-category-dropdown button')?.click(); true`);
  await sleep(150);
  add('inline category selection replaces the placeholder with a cover', await evaluate(cdp, `(() => {
    const page = document.querySelector('.music-game-page');
    return page?.classList.contains('is-category-cover')
      && Boolean(document.querySelector('.music-category-cover'))
      && /начать игру/i.test(document.querySelector('.music-next-song span')?.textContent || '')
      && !document.querySelector('.music-game-placeholder')
      && !document.querySelector('.music-current-card');
  })()`));
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(200);
  add('category cover starts the first song', await evaluate(cdp, `(() => {
    const page = document.querySelector('.music-game-page');
    return page?.classList.contains('is-playing')
      && Boolean(document.querySelector('.music-current-card h3'))
      && /новая песня/i.test(document.querySelector('.music-next-song span')?.textContent || '')
      && /60/.test(document.querySelector('.music-next-song b')?.textContent || '')
      && !document.querySelector('[class*="game-placeholder"]');
  })()`));

  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaProtectedMusic=${Date.now()}#/music-game`);
  await sleep(250);
  add('guest deep-link shows the inline category placeholder', await evaluate(cdp, `location.hash === '#/music-game' && Boolean(document.querySelector('.music-game-placeholder')) && document.querySelector('.music-game-page')?.classList.contains('is-empty') && !document.querySelector('.music-current-card') && !document.querySelector('.music-next-song') && !document.querySelector('.login-page')`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 100, 'play', false);
  await navigate(cdp, `${BASE_URL}?qaNoBlanks=${Date.now()}#/music-game`);
  await sleep(250);
  add('logged-in user without a category sees the same inline placeholder', await evaluate(cdp, `location.hash === '#/music-game' && Boolean(document.querySelector('.music-game-placeholder')) && document.querySelector('.music-game-page')?.classList.contains('is-empty') && !document.querySelector('.music-current-card') && !document.querySelector('.music-next-song')`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 100, 'play', false);
  await navigate(cdp, `${BASE_URL}?qaPlaySuccessNoBlanks=${Date.now()}#/auth-login-success`);
  add('play-login without blanks still offers play', await evaluate(cdp, `(() => {
    const buttons = document.querySelectorAll('.auth-flow-success-page .auth-card > button');
    return buttons.length === 2 && /играть/i.test(buttons[0].textContent || '') && /на главную/i.test(buttons[1].textContent || '');
  })()`), await evaluate(cdp, `document.querySelector('.auth-flow-success-page .auth-card')?.textContent || ''`));

  await prepareStorage(cdp, 100, 'play', true);
  await navigate(cdp, `${BASE_URL}?qaPlaySuccessWithBlanks=${Date.now()}#/auth-login-success`);
  add('play-login with blanks offers play and home', await evaluate(cdp, `(() => {
    const buttons = Array.from(document.querySelectorAll('.auth-flow-success-page .auth-card > button')).map((button) => button.textContent.trim().toLowerCase());
    return buttons.length === 2 && buttons[0] === 'играть' && buttons[1] === 'на главную';
  })()`), await evaluate(cdp, `document.querySelector('.auth-flow-success-page .auth-card')?.textContent || ''`));

  await navigate(cdp, `${BASE_URL}?qaUnknown=${Date.now()}#/does-not-exist`);
  await sleep(200);
  add('unknown route falls back to home', await evaluate(cdp, `location.hash === '#/' && Boolean(document.querySelector('.home-page'))`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaMusic=${Date.now()}#/music-detail`);
  add('inline blanks promo is a real link', await evaluate(cdp, `(() => {
    const link = document.querySelector('.music-blanks-inline-link');
    return link?.tagName === 'A' && link.getAttribute('href') === '#/music-buy-blanks';
  })()`));
  add('inline blanks promo keeps the original inline styling', await evaluate(cdp, `(() => {
    const link = document.querySelector('.music-blanks-inline-link');
    if (!link) return false;
    const linkRects = Array.from(link.getClientRects());
    const style = getComputedStyle(link);
    return style.display === 'inline'
      && style.color === 'rgb(255, 139, 30)'
      && style.textDecorationLine.includes('underline')
      && linkRects.length > 1;
  })()`));
  const inlinePromoPoint = await activateElementWithEnter(cdp, '.music-blanks-inline-link');
  add('inline blanks promo center is keyboard-accessible', inlinePromoPoint.hitMatches && inlinePromoPoint.width > 0 && inlinePromoPoint.height > 0, JSON.stringify(inlinePromoPoint));
  await sleep(220);
  add('inline blanks promo opens purchase form with Enter', await evaluate(cdp, `location.hash === '#/music-buy-blanks' && Math.abs(document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top || 999) < 3`), await evaluate(cdp, `location.hash`));
  await activateElementWithEnter(cdp, '.music-blanks-inline-link');
  await sleep(220);
  add('inline blanks promo reopens purchase form on the existing purchase route', await evaluate(cdp, `location.hash === '#/music-buy-blanks' && Math.abs(document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top || 999) < 3`), await evaluate(cdp, `JSON.stringify({ hash: location.hash, top: document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top })`));

  await navigate(cdp, `${BASE_URL}?qaMusicAttention=${Date.now()}#/music-detail`);
  add('attention blanks promo is a real purchase link', await evaluate(cdp, `(() => {
    const link = document.querySelector('.music-blanks-attention');
    return link?.tagName === 'A' && link.getAttribute('href') === '#/music-buy-blanks';
  })()`));
  add('attention blanks promo covers the full attention card', await evaluate(cdp, `(() => {
    const card = document.querySelector('.music-feature-card.is-attention');
    const link = document.querySelector('.music-blanks-attention');
    if (!card || !link) return false;
    const cardRect = card.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return Math.abs(cardRect.left - linkRect.left) < 1
      && Math.abs(cardRect.top - linkRect.top) < 1
      && Math.abs(cardRect.width - linkRect.width) < 1
      && Math.abs(cardRect.height - linkRect.height) < 1;
  })()`));
  const attentionPromoPoint = await clickElementAtCenter(cdp, '.music-blanks-attention');
  add('attention blanks promo center has a physical hit area', attentionPromoPoint.hitMatches && attentionPromoPoint.width >= 32 && attentionPromoPoint.height >= 32, JSON.stringify(attentionPromoPoint));
  await sleep(220);
  add('attention blanks promo opens purchase form with pointer', await evaluate(cdp, `location.hash === '#/music-buy-blanks' && Math.abs(document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top || 999) < 3`), await evaluate(cdp, `location.hash`));
  await clickElementAtCenter(cdp, '.music-blanks-attention');
  await sleep(220);
  add('attention blanks promo reopens purchase form on the existing purchase route', await evaluate(cdp, `location.hash === '#/music-buy-blanks' && Math.abs(document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top || 999) < 3`), await evaluate(cdp, `JSON.stringify({ hash: location.hash, top: document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top })`));

  await navigate(cdp, `${BASE_URL}?qaMusicBuyForm=${Date.now()}#/music-detail`);
  const initialBlankForm = await evaluate(cdp, `(() => {
    const counter = document.querySelector('.blank-counter');
    const buttons = Array.from(counter?.querySelectorAll('button') || []);
    const categoryText = document.querySelector('.blank-category-button > span');
    const arrow = document.querySelector('.blank-category-button i');
    const arrowPath = arrow?.querySelector('path');
    const canvas = document.querySelector('.responsive-canvas');
    const canvasScale = Number.parseFloat(getComputedStyle(canvas).getPropertyValue('--canvas-scale')) || 1;
    const counterRect = counter?.getBoundingClientRect();
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());
    return {
      count: counter?.querySelector('strong')?.textContent?.trim() || '',
      cost: document.querySelector('.blank-cost-row span')?.textContent?.trim() || '',
      minusDisabled: Boolean(buttons[0]?.disabled),
      plusDisabled: Boolean(buttons[1]?.disabled),
      categoryLeft: categoryText?.getBoundingClientRect().left || 0,
      categoryTextAlign: categoryText ? getComputedStyle(categoryText).textAlign : '',
      arrowBackground: arrow ? getComputedStyle(arrow).backgroundColor : '',
      arrowStroke: arrowPath ? getComputedStyle(arrowPath).stroke : '',
      arrowLinecap: arrowPath ? getComputedStyle(arrowPath).strokeLinecap : '',
      canvasScale,
      counterCenter: counterRect ? counterRect.top + counterRect.height / 2 : 0,
      buttons: buttonRects.map((rect) => ({
        width: rect.width,
        height: rect.height,
        center: rect.top + rect.height / 2,
      })),
    };
  })()`);
  add(
    'blank order starts at the approved minimum of 2',
    initialBlankForm.count === '2 бланка'
      && /100/.test(initialBlankForm.cost)
      && initialBlankForm.minusDisabled
      && !initialBlankForm.plusDisabled,
    JSON.stringify(initialBlankForm),
  );
  add(
    'blank counter circles are equal and vertically centered',
    initialBlankForm.buttons.length === 2
      && initialBlankForm.buttons.every((button) => (
        Math.abs(button.width / initialBlankForm.canvasScale - 32) <= 0.5
        && Math.abs(button.height / initialBlankForm.canvasScale - 32) <= 0.5
        && Math.abs(button.center - initialBlankForm.counterCenter) <= 0.5
      )),
    JSON.stringify(initialBlankForm.buttons),
  );
  add(
    'blank category arrow uses the approved orange circle and rounded white SVG',
    initialBlankForm.arrowBackground === 'rgb(255, 139, 30)'
      && initialBlankForm.arrowStroke === 'rgb(255, 255, 255)'
      && initialBlankForm.arrowLinecap === 'round',
    JSON.stringify({
      background: initialBlankForm.arrowBackground,
      stroke: initialBlankForm.arrowStroke,
      linecap: initialBlankForm.arrowLinecap,
    }),
  );
  await evaluate(cdp, `document.querySelector('.blank-counter button:first-child')?.click(); true`);
  await sleep(100);
  add(
    'blank counter cannot go below 2',
    await evaluate(cdp, `document.querySelector('.blank-counter strong')?.textContent?.trim() === '2 бланка'`),
  );
  await evaluate(cdp, `document.querySelector('.blank-category-button').click(); true`);
  await sleep(150);
  add('category dropdown opens', Boolean(await evaluate(cdp, `Boolean(document.querySelector('.blank-category-list'))`)));
  await evaluate(cdp, `document.querySelector('.blank-category-list button')?.click(); document.querySelector('.blank-counter button:last-child')?.click(); true`);
  await sleep(150);
  const counterText = await evaluate(cdp, `document.querySelector('.blank-counter strong')?.textContent || ''`);
  const selectedCategoryLeft = await evaluate(cdp, `document.querySelector('.blank-category-button > span')?.getBoundingClientRect().left || 0`);
  add('blank counter increments from 2 to 3', counterText.trim() === '3 бланка', counterText);
  add(
    'selected category stays aligned with the placeholder',
    initialBlankForm.categoryTextAlign === 'left'
      && Math.abs(selectedCategoryLeft - initialBlankForm.categoryLeft) <= 0.5,
    JSON.stringify({ placeholderLeft: initialBlankForm.categoryLeft, selectedLeft: selectedCategoryLeft }),
  );
  await evaluate(cdp, `(() => {
    const plus = document.querySelector('.blank-counter button:last-child');
    for (let index = 0; index < 40; index += 1) plus?.click();
    return true;
  })()`);
  await sleep(180);
  const maximumBlankForm = await evaluate(cdp, `(() => ({
    count: document.querySelector('.blank-counter strong')?.textContent?.trim() || '',
    cost: document.querySelector('.blank-cost-row span')?.textContent?.trim() || '',
    plusDisabled: Boolean(document.querySelector('.blank-counter button:last-child')?.disabled),
  }))()`);
  add(
    'blank counter stops at the maximum of 30',
    maximumBlankForm.count === '30 бланков'
      && /1[\\s ]?500/.test(maximumBlankForm.cost)
      && maximumBlankForm.plusDisabled,
    JSON.stringify(maximumBlankForm),
  );

  await navigate(cdp, BASE_URL);
  await evaluate(cdp, `(() => {
    localStorage.clear();
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaKaraoke=${Date.now()}#/karaoke-splash`);
  const karaokeControlsClosed = await evaluate(cdp, `(() => {
    const root = document.querySelector('.music-game-controls');
    if (!root) return null;
    const style = getComputedStyle(root);
    return {
      display: style.display,
      columns: style.gridTemplateColumns,
      gap: style.gap,
      cards: [...root.children].map((card) => {
        const cardStyle = getComputedStyle(card);
        return {
          width: Number(card.getBoundingClientRect().width.toFixed(2)),
          height: Number(card.getBoundingClientRect().height.toFixed(2)),
          radius: cardStyle.borderRadius,
          background: cardStyle.backgroundColor,
          text: card.textContent.replace(/\\s+/g, ' ').trim(),
        };
      }),
    };
  })()`);
  add(
    'karaoke controls use the shared two-column card component',
    karaokeControlsClosed?.display === 'grid'
      && karaokeControlsClosed.cards?.length === 4
      && karaokeControlsClosed.columns?.split(' ').length === 2
      && !await evaluate(cdp, `Boolean(document.querySelector('.music-game-control-list'))`),
    JSON.stringify(karaokeControlsClosed),
  );
  await evaluate(cdp, `document.querySelector('.karaoke-splash-page .music-category-select')?.click(); true`);
  await sleep(100);
  const karaokeControlsOpen = await evaluate(cdp, `(() => {
    const root = document.querySelector('.music-game-controls');
    if (!root) return null;
    const style = getComputedStyle(root);
    return {
      display: style.display,
      columns: style.gridTemplateColumns,
      gap: style.gap,
      cards: [...root.children].map((card) => {
        const cardStyle = getComputedStyle(card);
        return {
          width: Number(card.getBoundingClientRect().width.toFixed(2)),
          height: Number(card.getBoundingClientRect().height.toFixed(2)),
          radius: cardStyle.borderRadius,
          background: cardStyle.backgroundColor,
          text: card.textContent.replace(/\\s+/g, ' ').trim(),
        };
      }),
    };
  })()`);
  add(
    'opening category selector keeps the same game controls',
    JSON.stringify(karaokeControlsOpen) === JSON.stringify(karaokeControlsClosed),
    JSON.stringify({ closed: karaokeControlsClosed, open: karaokeControlsOpen }),
  );
  add('karaoke categories visible', await evaluate(cdp, `document.querySelectorAll('.karaoke-splash-page .music-category-dropdown button').length >= 4`));
  const selectedKaraokeCategory = await evaluate(cdp, `document.querySelector('.karaoke-splash-page .music-category-dropdown button')?.textContent?.trim() || ''`);
  await evaluate(cdp, `document.querySelector('.karaoke-splash-page .music-category-dropdown button')?.click(); true`);
  await sleep(150);
  await evaluate(cdp, `document.querySelector('.karaoke-start')?.click(); true`);
  await sleep(150);
  add('karaoke start opens game', await evaluate(cdp, `location.hash === '#/karaoke-game' || location.hash === '#karaoke-game'`), await evaluate(cdp, `location.hash`));
  const carriedKaraokeGame = await evaluate(cdp, `(() => ({
    stored: localStorage.getItem('bitva_music_category') || '',
    songIndex: localStorage.getItem('bitva_music_song_index') || '',
    played: localStorage.getItem('bitva_music_played_indexes') || '',
    coverLabel: document.querySelector('.music-category-cover')?.getAttribute('aria-label') || '',
    songTitle: document.querySelector('.music-current-card h3')?.textContent?.trim() || '',
    remaining: document.querySelector('.music-next-song b')?.textContent || '',
    nextLabel: document.querySelector('.music-next-song span')?.textContent || '',
    pageClass: document.querySelector('.music-game-page')?.className || '',
    retiredOrange: Boolean(document.querySelector('[class*="game-placeholder"]')),
  }))()`);
  add(
    'karaoke cover starts its selected category song directly',
    Boolean(selectedKaraokeCategory)
      && carriedKaraokeGame.stored === selectedKaraokeCategory
      && carriedKaraokeGame.songIndex === '0'
      && carriedKaraokeGame.played === '[]'
      && !carriedKaraokeGame.coverLabel
      && Boolean(carriedKaraokeGame.songTitle)
      && /60/.test(carriedKaraokeGame.remaining)
      && /новая песня/i.test(carriedKaraokeGame.nextLabel)
      && carriedKaraokeGame.pageClass.split(/\s+/).includes('is-playing')
      && !carriedKaraokeGame.retiredOrange,
    JSON.stringify({ selectedKaraokeCategory, ...carriedKaraokeGame }),
  );
  add('karaoke start does not duplicate the category cover', await evaluate(cdp, `!document.querySelector('.music-category-cover') && Boolean(document.querySelector('.music-current-card h3'))`));

  await prepareStorage(cdp, 11240, 'default', true, undefined, [], 'Хиты караоке');
  await evaluate(cdp, `(() => {
    localStorage.setItem('bitva_music_show_category_cover', '1');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaLegacyCategoryCover=${Date.now()}#/music-game`);
  const selectedCoverControls = await evaluate(cdp, `(() => {
    const root = document.querySelector('.music-game-controls');
    if (!root) return null;
    const style = getComputedStyle(root);
    return {
      display: style.display,
      columns: style.gridTemplateColumns,
      gap: style.gap,
      cards: [...root.children].map((card) => {
        const cardStyle = getComputedStyle(card);
        return {
          width: Number(card.getBoundingClientRect().width.toFixed(2)),
          height: Number(card.getBoundingClientRect().height.toFixed(2)),
          radius: cardStyle.borderRadius,
          background: cardStyle.backgroundColor,
          text: card.textContent.replace(/\\s+/g, ' ').trim(),
        };
      }),
    };
  })()`);
  add(
    'category cover and choose-category state share one controls design',
    JSON.stringify(selectedCoverControls) === JSON.stringify(karaokeControlsClosed),
    JSON.stringify({ chooseCategory: karaokeControlsClosed, categoryCover: selectedCoverControls }),
  );
  add(
    'saved category-cover state restores the correct cover',
    await evaluate(cdp, `(() => {
      const page = document.querySelector('.music-game-page');
      return localStorage.getItem('bitva_music_show_category_cover') === '1'
        && /Хиты караоке/i.test(document.querySelector('.music-category-cover')?.getAttribute('aria-label') || '')
        && page?.classList.contains('is-category-cover')
        && !document.querySelector('[class*="game-placeholder"]');
    })()`),
    await evaluate(cdp, `JSON.stringify({
      legacyKey: localStorage.getItem('bitva_music_show_category_cover'),
      title: document.querySelector('.music-current-card h3')?.textContent || '',
      pageClass: document.querySelector('.music-game-page')?.className || '',
    })`),
  );

  await prepareStorage(cdp, 11240, 'default', false);
  await evaluate(cdp, `(() => {
    localStorage.setItem('bitva_music_category', '');
    localStorage.setItem('bitva_music_song_index', '17');
    localStorage.setItem('bitva_music_played_indexes', JSON.stringify([0, 1, 2, 3]));
    localStorage.setItem('bitva_music_show_category_cover', '1');
    return true;
  })()`);
  await navigate(cdp, `${BASE_URL}?qaGameLogic=${Date.now()}#/music-game`);
  const inlinePlaceholderState = await evaluate(cdp, `(() => {
    const page = document.querySelector('.music-game-page');
    const placeholder = document.querySelector('.music-game-placeholder');
    const title = placeholder?.querySelector('h2');
    const copy = placeholder?.querySelector('p');
    const artwork = placeholder?.querySelector('img');
    if (!page || !placeholder || !title || !copy || !artwork) return null;
    const placeholderStyle = getComputedStyle(placeholder);
    const titleStyle = getComputedStyle(title);
    const copyStyle = getComputedStyle(copy);
    const artworkStyle = getComputedStyle(artwork);
    return {
      pageClass: page.className,
      title: title.textContent.trim(),
      copy: copy.textContent.trim(),
      height: parseFloat(placeholderStyle.height),
      radius: parseFloat(placeholderStyle.borderRadius),
      titleLeft: parseFloat(titleStyle.left),
      titleTop: parseFloat(titleStyle.top),
      titleSize: parseFloat(titleStyle.fontSize),
      copyLeft: parseFloat(copyStyle.left),
      copyTop: parseFloat(copyStyle.top),
      artworkLeft: parseFloat(artworkStyle.left),
      artworkTop: parseFloat(artworkStyle.top),
      artworkWidth: parseFloat(artworkStyle.width),
      artworkHeight: parseFloat(artworkStyle.height),
      artworkSrc: artwork.getAttribute('src') || '',
      hasSong: Boolean(document.querySelector('.music-current-card')),
      hasCover: Boolean(document.querySelector('.music-category-cover')),
      hasNext: Boolean(document.querySelector('.music-next-song')),
      top: placeholder.getBoundingClientRect().top,
    };
  })()`);
  add(
    'music game uses the exact inline Figma placeholder before category selection',
    inlinePlaceholderState
      && inlinePlaceholderState.pageClass.split(/\s+/).includes('is-empty')
      && /выберите категорию/i.test(inlinePlaceholderState.title)
      && /после выбора категории/i.test(inlinePlaceholderState.copy)
      && Math.abs(inlinePlaceholderState.height - 479.23) < 0.1
      && Math.abs(inlinePlaceholderState.radius - 40) < 0.1
      && Math.abs(inlinePlaceholderState.titleLeft - 32.75) < 0.1
      && Math.abs(inlinePlaceholderState.titleTop - 37.78) < 0.1
      && Math.abs(inlinePlaceholderState.titleSize - 82.38) < 0.1
      && Math.abs(inlinePlaceholderState.copyLeft - 32.75) < 0.1
      && Math.abs(inlinePlaceholderState.copyTop - 185.28) < 0.1
      && Math.abs(inlinePlaceholderState.artworkLeft - 183.75) < 0.1
      && Math.abs(inlinePlaceholderState.artworkTop - 134.78) < 0.1
      && Math.abs(inlinePlaceholderState.artworkWidth - 296.18) < 0.1
      && Math.abs(inlinePlaceholderState.artworkHeight - 367.67) < 0.1
      && /music-game-empty-sheet\.png$/.test(inlinePlaceholderState.artworkSrc)
      && !inlinePlaceholderState.hasSong
      && !inlinePlaceholderState.hasCover
      && !inlinePlaceholderState.hasNext,
    JSON.stringify(inlinePlaceholderState),
  );
  await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
  await sleep(150);
  add('music category selector stays over the inline placeholder without reflow', await evaluate(cdp, `(() => {
    const placeholder = document.querySelector('.music-game-placeholder');
    return (location.hash === '#/music-game' || location.hash === '#music-game')
      && Boolean(document.querySelector('.music-category-dropdown'))
      && Boolean(placeholder)
      && Math.abs(placeholder.getBoundingClientRect().top - ${Number(inlinePlaceholderState?.top || 0)}) < 0.1
      && !document.querySelector('.music-current-card')
      && !document.querySelector('.music-next-song')
      && !document.querySelector('.music-reset-modal');
  })()`), await evaluate(cdp, `location.hash`));
  const selectedInlineCategory = await evaluate(cdp, `document.querySelectorAll('.music-category-dropdown button')[1]?.textContent?.trim() || ''`);
  await evaluate(cdp, `document.querySelectorAll('.music-category-dropdown button')[1]?.click(); true`);
  await sleep(150);
  const inlineCategoryCover = await evaluate(cdp, `(() => ({
    stored: localStorage.getItem('bitva_music_category') || '',
    songIndex: localStorage.getItem('bitva_music_song_index') || '',
    played: localStorage.getItem('bitva_music_played_indexes') || '',
    coverLabel: document.querySelector('.music-category-cover')?.getAttribute('aria-label') || '',
    remaining: document.querySelector('.music-next-song b')?.textContent || '',
    nextLabel: document.querySelector('.music-next-song span')?.textContent || '',
    pageClass: document.querySelector('.music-game-page')?.className || '',
    retiredOrange: Boolean(document.querySelector('[class*="game-placeholder"]')),
  }))()`);
  add(
    'music category selection opens the correct category cover',
    inlineCategoryCover.stored === selectedInlineCategory
      && inlineCategoryCover.songIndex === '0'
      && inlineCategoryCover.played === '[]'
      && inlineCategoryCover.coverLabel.includes(selectedInlineCategory)
      && /60/.test(inlineCategoryCover.remaining)
      && /начать игру/i.test(inlineCategoryCover.nextLabel)
      && inlineCategoryCover.pageClass.split(/\s+/).includes('is-category-cover')
      && !inlineCategoryCover.retiredOrange,
    JSON.stringify({ selectedInlineCategory, ...inlineCategoryCover }),
  );
  add('music category selection resets stale progress', await evaluate(cdp, `localStorage.getItem('bitva_music_song_index') === '0' && localStorage.getItem('bitva_music_played_indexes') === '[]' && document.querySelectorAll('.music-game-controls .karaoke-control-icon')[1]?.textContent?.trim() === '0'`), await evaluate(cdp, `JSON.stringify({ index: localStorage.getItem('bitva_music_song_index'), played: localStorage.getItem('bitva_music_played_indexes') })`));
  add('category cover state is saved', await evaluate(cdp, `localStorage.getItem('bitva_music_show_category_cover') === '1'`), await evaluate(cdp, `localStorage.getItem('bitva_music_show_category_cover') || ''`));
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(180);
  const firstSongTitle = await evaluate(cdp, `document.querySelector('.music-current-card h3')?.textContent?.trim() || ''`);
  const firstRemaining = await evaluate(cdp, `document.querySelector('.music-next-song b')?.textContent || ''`);
  add('category cover starts the selected category song', Boolean(firstSongTitle) && /60/.test(firstRemaining) && await evaluate(cdp, `document.querySelector('.music-game-page')?.classList.contains('is-playing') && /новая песня/i.test(document.querySelector('.music-next-song span')?.textContent || '')`), JSON.stringify({ firstSongTitle, firstRemaining }));
  await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
  await sleep(150);
  add('opening music category menu keeps the current song visible', await evaluate(cdp, `(() => {
    const page = document.querySelector('.music-game-page');
    return Boolean(document.querySelector('.music-category-dropdown'))
      && Boolean(document.querySelector('.music-current-card h3'))
      && page?.classList.contains('is-playing')
      && !document.querySelector('[class*="game-placeholder"]')
      && !document.querySelector('[class*="category-cover"]');
  })()`));
  await evaluate(cdp, `document.querySelector('.music-category-select')?.click(); true`);
  await sleep(100);
  await evaluate(cdp, `document.querySelector('.music-pause')?.click(); true`);
  await sleep(150);
  add('music pause toggles on', await evaluate(cdp, `document.querySelector('.music-pause')?.classList.contains('is-paused') && document.querySelector('.music-pause')?.getAttribute('aria-pressed') === 'true'`));
  add('music resume uses the rounded Figma play icon', await evaluate(cdp, `(() => {
    const element = document.querySelector('.music-pause.is-paused span:first-child');
    if (!element) return false;
    const style = getComputedStyle(element);
    const mask = style.maskImage || style.webkitMaskImage || '';
    return mask.includes('fbf0a535b47b-24c9f666424e5c1fa384d780a94a1327488696c2.svg');
  })()`));
  await evaluate(cdp, `document.querySelector('.music-pause')?.click(); true`);
  await sleep(150);
  add('music pause toggles off', await evaluate(cdp, `!document.querySelector('.music-pause')?.classList.contains('is-paused') && document.querySelector('.music-pause')?.getAttribute('aria-pressed') === 'false'`));
  await evaluate(cdp, `document.querySelector('.music-share')?.click(); true`);
  await sleep(200);
  add('music song fullscreen opens', await evaluate(cdp, `document.querySelector('.music-current-card')?.classList.contains('is-fullscreen') && (location.hash === '#/music-game' || location.hash === '#music-game')`), await evaluate(cdp, `location.hash`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await sleep(200);
  add('music song fullscreen closes on escape', await evaluate(cdp, `!document.querySelector('.music-current-card')?.classList.contains('is-fullscreen')`));
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(200);
  const secondSongTitle = await evaluate(cdp, `document.querySelector('.music-current-card h3')?.textContent || ''`);
  const secondRemaining = await evaluate(cdp, `document.querySelector('.music-next-song b')?.textContent || ''`);
  add('music next song changes title', firstSongTitle && secondSongTitle && firstSongTitle !== secondSongTitle, JSON.stringify({ firstSongTitle, secondSongTitle }));
  add('music next song changes remaining count', firstRemaining !== secondRemaining && /59/.test(secondRemaining), JSON.stringify({ firstRemaining, secondRemaining }));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaGameControls=${Date.now()}#/music-game`);
  add('music blanks control uses the approved copy', await evaluate(cdp, `(() => { const button = document.querySelector('.music-game-controls button'); return button?.querySelector('strong')?.textContent?.trim() === 'Купить бланки' && /для этой игры или другой категории/i.test(button?.querySelector('span')?.textContent || ''); })()`), await evaluate(cdp, `document.querySelector('.music-game-controls button')?.textContent || ''`));
  await evaluate(cdp, `document.querySelector('.music-game-controls button')?.click(); true`);
  await sleep(200);
  add('music buy-category control opens blanks page', await evaluate(cdp, `location.hash === '#/music-blanks' || location.hash === '#music-blanks'`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaWinnerControl=${Date.now()}#/music-game`);
  await evaluate(cdp, `document.querySelectorAll('.music-game-controls button')[2]?.click(); true`);
  await sleep(200);
  add('music winner control opens winner page', await evaluate(cdp, `location.hash === '#/music-winner' || location.hash === '#music-winner'`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaSongsControl=${Date.now()}#/music-game`);
  const emptyPlayedCount = await evaluate(cdp, `document.querySelector('.music-game-controls .karaoke-control-icon.is-played')?.textContent?.trim() || ''`);
  add('music fallen songs count starts at zero', emptyPlayedCount === '0', emptyPlayedCount);
  await chooseMusicCategoryAndStart(cdp);
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(200);
  const onePlayedCount = await evaluate(cdp, `document.querySelectorAll('.music-game-controls .karaoke-control-icon')[1]?.textContent?.trim() || ''`);
  add('music fallen songs count follows progress', onePlayedCount === '1', onePlayedCount);
  await evaluate(cdp, `document.querySelectorAll('.music-game-controls button')[1]?.click(); true`);
  await sleep(200);
  add('music fallen songs route opens', await evaluate(cdp, `location.hash === '#/music-songs' || location.hash === '#music-songs'`), await evaluate(cdp, `location.hash`));
  add('music fallen songs include previous song', await evaluate(cdp, `document.querySelector('.music-songs-list')?.textContent.includes(${JSON.stringify(firstSongTitle)})`));
  add('music fallen songs list is numbered by play order', await evaluate(cdp, `document.querySelector('.music-song-number')?.textContent?.trim() === '1'`));
  add('music fallen songs numbers follow Figma and stay visually hidden', await evaluate(cdp, `(() => { const item = document.querySelector('.music-song-number'); if (!item) return false; const rect = item.getBoundingClientRect(); const style = getComputedStyle(item); return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || (rect.width === 0 && rect.height === 0); })()`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaNewGame=${Date.now()}#/music-game`);
  await chooseMusicCategoryAndStart(cdp);
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(150);
  await evaluate(cdp, `document.querySelectorAll('.music-game-controls button')[3]?.click(); true`);
  await sleep(200);
  add('music new-game modal opens', await evaluate(cdp, `(location.hash === '#/music-new-game' || location.hash === '#music-new-game') && Boolean(document.querySelector('.music-reset-modal'))`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.music-modal-secondary')?.click(); true`);
  await sleep(200);
  add('music modal back closes without history trap', await evaluate(cdp, `(location.hash === '#/music-game' || location.hash === '#music-game') && !document.querySelector('.music-reset-modal')`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.detail-nav > button:not(.detail-account):not(.close-user)')?.click(); true`);
  await sleep(200);
  add('music page back leaves game after modal cancel', await evaluate(cdp, `location.hash === '#/music-detail' && Boolean(document.querySelector('.music-detail-page')) && !document.querySelector('.music-reset-modal')`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 11240);
  await navigate(cdp, `${BASE_URL}?qaNewGameReset=${Date.now()}#/music-game`);
  await chooseMusicCategoryAndStart(cdp);
  const resetFirstSongTitle = await evaluate(cdp, `document.querySelector('.music-current-card h3')?.textContent || ''`);
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(150);
  await evaluate(cdp, `document.querySelectorAll('.music-game-controls button')[3]?.click(); true`);
  await sleep(200);
  await evaluate(cdp, `document.querySelector('.music-modal-primary')?.click(); true`);
  await sleep(250);
  const resetCoverState = await evaluate(cdp, `(() => ({
    hash: location.hash,
    coverLabel: document.querySelector('.music-category-cover')?.getAttribute('aria-label') || '',
    remaining: document.querySelector('.music-next-song b')?.textContent || '',
    nextLabel: document.querySelector('.music-next-song span')?.textContent || '',
    songIndex: localStorage.getItem('bitva_music_song_index') || '',
    played: localStorage.getItem('bitva_music_played_indexes') || '',
    pageClass: document.querySelector('.music-game-page')?.className || '',
    retiredOrange: Boolean(document.querySelector('[class*="game-placeholder"]')),
  }))()`);
  add(
    'music new-game returns to the selected category cover',
    (resetCoverState.hash === '#/music-game' || resetCoverState.hash === '#music-game')
      && Boolean(resetCoverState.coverLabel)
      && resetCoverState.songIndex === '0'
      && resetCoverState.played === '[]'
      && /60/.test(resetCoverState.remaining)
      && /начать игру/i.test(resetCoverState.nextLabel)
      && resetCoverState.pageClass.split(/\s+/).includes('is-category-cover')
      && !resetCoverState.retiredOrange,
    JSON.stringify(resetCoverState),
  );
  await evaluate(cdp, `document.querySelector('.music-next-song')?.click(); true`);
  await sleep(200);
  const resetSongTitle = await evaluate(cdp, `document.querySelector('.music-current-card h3')?.textContent?.trim() || ''`);
  const resetRemaining = await evaluate(cdp, `document.querySelector('.music-next-song b')?.textContent || ''`);
  add('music new-game resets song', resetSongTitle === resetFirstSongTitle, JSON.stringify({ resetFirstSongTitle, resetSongTitle }));
  add('music new-game resets remaining count', /60/.test(resetRemaining), resetRemaining);
  await evaluate(cdp, `document.querySelector('.detail-nav > button:not(.detail-account):not(.close-user)')?.click(); true`);
  await sleep(200);
  add('music page back leaves game after reset', await evaluate(cdp, `location.hash === '#/music-detail' && Boolean(document.querySelector('.music-detail-page'))`), await evaluate(cdp, `location.hash`));

  await prepareStorage(cdp, 0);
  await navigate(cdp, `${BASE_URL}?qaBuy=${Date.now()}#/buy-blanks`);
  add('buy no-coins message visible', Boolean(await evaluate(cdp, `Boolean(document.querySelector('.buy-summary p'))`)));
  await evaluate(cdp, `document.querySelector('.buy-confirm-button')?.click(); true`);
  await sleep(250);
  add('top-up opens payment site step', await evaluate(cdp, `location.hash === '#/balance-top-up' && Boolean(document.querySelector('.payment-card'))`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.payment-card > button')?.click(); true`);
  await sleep(250);
  const balanceAfterTopUp = await evaluate(cdp, `document.querySelector('.detail-account .balance-badge strong')?.textContent || ''`);
  add('top-up changes balance', /100/.test(balanceAfterTopUp), balanceAfterTopUp);
  add('payment return shows topped-up confirmation state', await evaluate(cdp, `location.hash === '#/buy-blanks' && /баланс пополнен/i.test(document.querySelector('.buy-confirm-card h1')?.textContent || '')`), await evaluate(cdp, `document.querySelector('.buy-confirm-card h1')?.textContent || location.hash`));
  await evaluate(cdp, `document.querySelector('.buy-confirm-button')?.click(); true`);
  await sleep(250);
  add('paid blanks open purchase success', await evaluate(cdp, `location.hash === '#/register-success' && /спасибо за покупку/i.test(document.querySelector('.auth-card')?.textContent || '')`), await evaluate(cdp, `location.hash`));
  await evaluate(cdp, `document.querySelector('.register-success-page .secondary-wide')?.click(); true`);
  await sleep(250);
  add('purchase success returns to game', await evaluate(cdp, `location.hash === '#/music-game'`), await evaluate(cdp, `location.hash`));

  return checks;
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
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    if (MOCK_AUTH_SESSION) {
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/me', requestStage: 'Request' }] });
      cdp.on('Fetch.requestPaused', async (event) => {
        const payload = mockSessionUser
          ? { status: 200, body: { user: mockSessionUser } }
          : { status: 401, body: { error: { code: 'UNAUTHORIZED', message: '\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0432\u0445\u043e\u0434' } } };
        try {
          await cdp.send('Fetch.fulfillRequest', {
            requestId: event.requestId,
            responseCode: payload.status,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
            body: Buffer.from(JSON.stringify(payload.body)).toString('base64'),
          });
        } catch {
          // A navigation can replace the request before the mocked response is sent.
        }
      });
    }
    const runtimeErrors = [];
    const consoleErrors = [];
    const httpErrors = [];
    cdp.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event.exceptionDetails?.text || 'Runtime exception'));
    cdp.on('Runtime.consoleAPICalled', (event) => {
      if (event.type === 'error' || event.type === 'assert') {
        consoleErrors.push(event.args?.map((arg) => arg.value || arg.description || '').join(' ') || event.type);
      }
    });
    cdp.on('Log.entryAdded', (event) => {
      if (event.entry?.level === 'error') consoleErrors.push(event.entry.text || 'Console error');
    });
    cdp.on('Network.responseReceived', (event) => {
      if (event.response?.status >= 400) httpErrors.push(`${event.response.status} ${event.response.url}`);
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const shotResults = [];
    if (process.env.QA_SKIP_CAPTURES !== '1') {
      for (const item of activeCaptures) {
        shotResults.push(await capturePage(cdp, item));
      }
    }
    const checks = process.env.QA_SKIP_CHECKS === '1' ? [] : await runChecks(cdp);
    checks.push(
      { name: 'runtime exceptions: 0', pass: runtimeErrors.length === 0, detail: JSON.stringify(runtimeErrors.slice(0, 10)) },
      { name: 'console errors: 0', pass: consoleErrors.length === 0, detail: JSON.stringify(consoleErrors.slice(0, 10)) },
      { name: 'HTTP errors: 0', pass: httpErrors.length === 0, detail: JSON.stringify(httpErrors.slice(0, 10)) },
    );
    const report = {
      baseUrl: BASE_URL,
      viewport: { width: WIDTH, height: HEIGHT },
      captures: shotResults,
      checks,
      passed: checks.every((check) => check.pass),
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
