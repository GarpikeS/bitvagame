const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const HOST = '127.0.0.1';
const PORT = 5195;
const BASE_URL = `http://${HOST}:${PORT}`;
const PROFILE_PREFIX = 'bitva-game-isolation-';
const GIRLS_HERO_SCREEN_GEOMETRY = '900x600+90+560';
const GIRLS_HERO_ORACLE_GEOMETRY = '900x600+30+42';
const GIRLS_HERO_MAX_NORMALIZED_RMSE = 0.05;
const CATEGORY_HERO_GEOMETRY = '960x960+60+518';
const CATEGORY_COVER_CASES = Object.freeze([
  { id: 'hits', title: 'Хиты караоке', sourceSuffix: null, naturalWidth: null, naturalHeight: null },
  { id: '90s', title: 'Хиты 90-х', sourceSuffix: '/reference/figma-category-covers/hits-90-figma.png', naturalWidth: 960, naturalHeight: 960 },
  { id: 'girls', title: 'Девичник', sourceSuffix: '/figma-assets/music-category-devichnik-figma.png', naturalWidth: 960, naturalHeight: 960 },
  { id: '2000s', title: 'Хиты 2000-х', sourceSuffix: '/generated/layout5/category-b3.png', naturalWidth: 466, naturalHeight: 465, fallback: true },
]);
const LEGACY_MUSIC_STATE = Object.freeze({
  category: 'Хиты 90-х',
  index: '37',
  played: '[2,5]',
  cover: '1',
});
const PURCHASE_SCREENS = Object.freeze({
  'karaoke-battle-purchase-confirm': { node: '1:754', className: 'l5p-page--confirm' },
  'karaoke-battle-purchase-insufficient': { node: '1:1544', className: 'l5p-page--insufficient' },
  'karaoke-battle-purchase-success': { node: '1:2649', className: 'l5p-page--success' },
  'karaoke-battle-girls-cover': { node: '1:2133', className: 'l5p-page--girls' },
  'karaoke-battle-2000s-purchase-confirm': { node: '1:754', className: 'l5p-page--confirm' },
  'karaoke-battle-2000s-purchase-insufficient': { node: '1:1544', className: 'l5p-page--insufficient' },
  'karaoke-battle-2000s-purchase-success': { node: '1:2649', className: 'l5p-page--success' },
});
const EXTRA_SCREENS = Object.freeze({
  'karaoke-battle-viewed-songs': { node: '1:2056', width: 1080, height: 3581 },
  'karaoke-battle-song-list': { node: '1:1575', width: 1080, height: 2680 },
  'karaoke-battle-purchases': { node: '1:5215', width: 1080, height: 2241 },
  'karaoke-battle-fullscreen-portrait-hidden': { node: '1:2841', width: 1080, height: 1891 },
  'karaoke-battle-fullscreen-portrait-answers': { node: '1:2874', width: 1080, height: 1891 },
  'karaoke-battle-fullscreen-landscape-hidden': { node: '1:2904', width: 1280, height: 800 },
  'karaoke-battle-fullscreen-landscape-answers': { node: '1:3368', width: 1280, height: 800 },
});
const ENTITLEMENT_PRICES = Object.freeze({ 'karaoke:90s': 50, 'karaoke:girls': 50, 'karaoke:2000s': 50 });
const AUTH_SUCCESS_CASES = Object.freeze([
  { name: 'register-purchase', route: 'auth-register-success', intent: 'purchase', payment: 'blanks', node: '1:3902', primary: 'Продолжить покупку', secondary: 'Личный кабинет' },
  { name: 'register-category', route: 'auth-register-success', intent: 'category-purchase', payment: 'karaoke-90s', node: '1:4057', primary: 'Купить категорию', secondary: 'Личный кабинет' },
  { name: 'register-default', route: 'auth-register-success', intent: 'default', payment: 'blanks', node: '1:4303', primary: 'Личный кабинет', secondary: 'На главную' },
  { name: 'login-purchase', route: 'auth-login-success', intent: 'purchase', payment: 'blanks', node: '1:4212', primary: 'Продолжить покупку', secondary: 'Личный кабинет' },
  { name: 'login-default', route: 'auth-login-success', intent: 'default', payment: 'blanks', node: '1:4235', primary: 'На главную', secondary: 'Личный кабинет' },
  { name: 'login-play', route: 'auth-login-success', intent: 'play', payment: 'blanks', node: '1:4258', primary: 'Играть', secondary: 'На главную' },
  { name: 'login-category', route: 'auth-login-success', intent: 'category-purchase', payment: 'karaoke-90s', node: '1:4281', primary: 'Купить категорию', secondary: null },
]);

function makeUser(overrides = {}) {
  return {
    id: 'isolation-qa',
    name: 'Тимур',
    email: 'qa@example.test',
    balanceCoins: 200,
    purchasedBlanks: [],
    purchasedCategories: [],
    gameEntitlements: [],
    ...overrides,
  };
}

function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

let navigationSequence = 0;

async function routeTo(page, route, selector, query = {}) {
  // A unique query forces a fresh App/session even when only the hash route changes.
  navigationSequence += 1;
  const search = new URLSearchParams({ qa: String(navigationSequence), ...query });
  await page.goto(`${BASE_URL}/?${search}#/${route}`, { waitUntil: 'networkidle' });
  if (selector) {
    try {
      await page.locator(selector).waitFor({ state: 'visible' });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        url: location.href,
        body: document.body.innerText.slice(0, 1000),
        roots: [...document.querySelectorAll('main')].map(node => node.className),
      }));
      throw new Error(`Route ${route} did not render ${selector}: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
  }
}

async function waitForRoute(page, route) {
  const expectedHash = route === 'home' ? '#/' : `#/${route}`;
  await page.waitForURL(url => url.hash === expectedHash);
}

async function legacyMusicState(page) {
  return page.evaluate(() => ({
    category: localStorage.getItem('bitva_music_category'),
    index: localStorage.getItem('bitva_music_song_index'),
    played: localStorage.getItem('bitva_music_played_indexes'),
    cover: localStorage.getItem('bitva_music_show_category_cover'),
  }));
}

async function assertLegacyMusicUnchanged(page) {
  assert.deepEqual(await legacyMusicState(page), LEGACY_MUSIC_STATE);
}

async function assertLayout5Screen(page, selector, expectedNode) {
  const root = page.locator(selector);
  await root.waitFor({ state: 'visible' });
  assert.equal(await root.getAttribute('data-layout'), '5');
  assert.equal(await root.getAttribute('data-figma-node'), expectedNode);
  assert.equal(await root.locator('audio').count(), 0);
  assert.deepEqual(await root.locator('img').evaluateAll(images => images
    .filter(image => !image.complete || !image.naturalWidth)
    .map(image => image.getAttribute('src'))), []);
}

function runMagick(args, root, label, acceptedStatuses = [0]) {
  const result = spawnSync('magick', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.ok(
    acceptedStatuses.includes(result.status),
    `${label}: ${result.error || result.stderr || result.stdout}`,
  );
  return result;
}

function cropImage({ geometry, input, output, root }) {
  runMagick([input, '-crop', geometry, '+repage', output], root, `Unable to crop ${input}`);
}

function normalizedRmse({ actual, reference, root }) {
  const result = runMagick(
    ['compare', '-metric', 'RMSE', reference, actual, 'null:'],
    root,
    `Unable to compare ${actual} with ${reference}`,
    [0, 1],
  );
  const rawMetric = String(result.stderr || result.stdout).trim();
  const match = rawMetric.match(/\(([+\-.\deE]+)\)\s*$/);
  const value = Number.parseFloat(match?.[1]);
  assert.ok(Number.isFinite(value), `Unreadable normalized RMSE metric: ${rawMetric}`);
  return value;
}

async function exposeNaturalReferenceCanvas(page) {
  await page.locator('.l5rg-page').evaluate(element => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    element.style.setProperty('--canvas-target-width', '1080px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.l5rg-page');
    const stage = document.querySelector('.responsive-canvas');
    return root && stage?.dataset.scaled === 'false'
      && Math.abs(root.getBoundingClientRect().width - 1080) < 0.01;
  });
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertCategoryCoverMatrix({ mediaRequests, page, profile, root }) {
  const mediaRequestStart = mediaRequests.length;
  const coverCrops = [];
  const sources = {};
  await page.setViewportSize({ width: 1080, height: 900 });

  for (const categoryCase of CATEGORY_COVER_CASES) {
    await page.evaluate(({ id }) => localStorage.setItem('bitva:layout5:karaoke-category', id), categoryCase);
    await routeTo(page, 'karaoke-battle-game', `.l5rg-page[data-category-id="${categoryCase.id}"][data-state="cover"]`);
    await page.waitForFunction(() => document.querySelector('.l5rg-page')?.dataset.imageComplete === 'true');
    await exposeNaturalReferenceCanvas(page);

    const game = page.locator('.l5rg-page');
    assert.equal(await game.getAttribute('data-category-title'), categoryCase.title);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('bitva:layout5:karaoke-category')),
      categoryCase.id,
    );

    const categoryCover = game.locator('img[data-reference-frame="category-cover"]');
    const sourceAttribute = await game.getAttribute('data-category-cover-source');
    if (categoryCase.sourceSuffix) {
      assert.equal(await categoryCover.count(), 1, `${categoryCase.id} must render its category cover layer`);
      const metrics = await categoryCover.evaluate(image => ({
        pathname: new URL(image.currentSrc, location.href).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }));
      assert.ok(metrics.pathname.endsWith(categoryCase.sourceSuffix), `${categoryCase.id} used ${metrics.pathname}`);
      assert.equal(metrics.complete, true);
      assert.equal(metrics.naturalWidth, categoryCase.naturalWidth);
      assert.equal(metrics.naturalHeight, categoryCase.naturalHeight);
      assert.ok(String(sourceAttribute).endsWith(categoryCase.sourceSuffix));
      assert.equal(await game.getAttribute('data-category-cover-fallback'), categoryCase.fallback ? 'true' : null);
      sources[categoryCase.id] = metrics.pathname;
    } else {
      assert.equal(await categoryCover.count(), 0, 'Hits must keep the exact base Figma cover without a duplicate overlay');
      assert.equal(sourceAttribute, null);
      sources[categoryCase.id] = 'reference/layout5/cover.png';
    }

    const screenshot = path.join(profile, `category-${categoryCase.id}-cover.png`);
    const crop = path.join(profile, `category-${categoryCase.id}-hero.png`);
    await game.screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
    cropImage({ input: screenshot, geometry: CATEGORY_HERO_GEOMETRY, output: crop, root });
    coverCrops.push({ id: categoryCase.id, crop });
  }

  const pairwiseRmse = {};
  for (let left = 0; left < coverCrops.length; left += 1) {
    for (let right = left + 1; right < coverCrops.length; right += 1) {
      const pair = `${coverCrops[left].id}:${coverCrops[right].id}`;
      const rmse = normalizedRmse({ actual: coverCrops[left].crop, reference: coverCrops[right].crop, root });
      assert.ok(rmse > 0.03, `Category covers ${pair} are still visually identical: RMSE ${rmse}`);
      pairwiseRmse[pair] = rmse;
    }
  }

  const media = await page.evaluate(() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
    playCalls: Number(window.__qaMediaPlayAttempts || 0),
  }));
  assert.deepEqual(media, { audio: 0, video: 0, playCalls: 0 });
  assert.deepEqual(mediaRequests.slice(mediaRequestStart), []);
  return { sources, pairwiseRmse, media };
}

async function assertOwnedGirlsStartsVisibleGirls({ mediaRequests, page, profile, root }) {
  const mediaRequestStart = mediaRequests.length;
  await page.setViewportSize({ width: 1080, height: 900 });
  await page.evaluate(() => localStorage.removeItem('bitva:layout5:karaoke-category'));
  await routeTo(page, 'karaoke-battle-categories', '.l56-page[data-render-mode="figma-reference"]');

  const playGirls = page.locator('[data-reference-hotspot="category-girls-action"]');
  assert.equal(await playGirls.count(), 1, 'Purchased Girls action must exist in the exact reference catalog');
  assert.equal(await playGirls.getAttribute('aria-label'), 'Играть: Девичник (куплено)');
  assert.equal(await playGirls.getAttribute('data-owned'), 'true');
  assert.equal(await playGirls.getAttribute('data-target-route'), 'karaoke-battle-game');
  await playGirls.click();
  await waitForRoute(page, 'karaoke-battle-game');

  const game = page.locator('.l5rg-page[data-state="cover"]');
  await game.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('.l5rg-page')?.dataset.imageComplete === 'true');
  assert.equal(await game.getAttribute('data-category-id'), 'girls', 'The game screen must expose the selected Girls category');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('bitva:layout5:karaoke-category')),
    'girls',
    'The exact purchased-category click must persist Girls in Layout 5 state',
  );
  const semantics = (await game.locator('.l5rg-visually-hidden').textContent()).replace(/\s+/g, ' ').trim();
  assert.match(semantics, /Выбранная категория:\s*Девичник\./);
  assert.doesNotMatch(semantics, /Выбранная категория:\s*Хиты караоке\./);

  await exposeNaturalReferenceCanvas(page);
  const selectedCategory = game.locator('.l5rg-selected-category');
  assert.equal(await selectedCategory.count(), 1, 'Girls selection must be visibly rendered in the selector');
  assert.equal((await selectedCategory.textContent()).trim(), 'Девичник');
  assert.equal(await selectedCategory.getAttribute('data-selected-category-id'), 'girls');
  assert.equal(await selectedCategory.getAttribute('data-selected-category-title'), 'Девичник');
  assert.equal(
    await game.locator('.l5rg-hit[data-action="select-category"]').getAttribute('aria-label'),
    'Категория: Девичник. Сменить категорию',
  );
  const selectedCategoryMetrics = await selectedCategory.evaluate(element => {
    const rootBounds = document.querySelector('.l5rg-page').getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      x: +(bounds.left - rootBounds.left).toFixed(4),
      y: +(bounds.top - rootBounds.top).toFixed(4),
      width: +bounds.width.toFixed(4),
      height: +bounds.height.toFixed(4),
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      textTransform: styles.textTransform,
    };
  });
  assert.ok(Math.abs(selectedCategoryMetrics.x - 65) < 0.02, `Selected category x drifted: ${selectedCategoryMetrics.x}`);
  assert.ok(Math.abs(selectedCategoryMetrics.y - 315.4309) < 0.02, `Selected category y drifted: ${selectedCategoryMetrics.y}`);
  assert.ok(Math.abs(selectedCategoryMetrics.width - 827) < 0.02, `Selected category width drifted: ${selectedCategoryMetrics.width}`);
  assert.ok(Math.abs(selectedCategoryMetrics.height - 118) < 0.02, `Selected category height drifted: ${selectedCategoryMetrics.height}`);
  assert.equal(selectedCategoryMetrics.backgroundColor, 'rgb(243, 243, 243)');
  assert.equal(selectedCategoryMetrics.color, 'rgb(35, 35, 35)');
  assert.equal(selectedCategoryMetrics.fontSize, '82.533px');
  assert.equal(selectedCategoryMetrics.fontWeight, '700');
  assert.equal(selectedCategoryMetrics.textTransform, 'uppercase');
  const categoryCover = game.locator('img[data-reference-frame="category-cover"]');
  assert.equal(await categoryCover.count(), 1, 'Girls cover must be a real visible image layer');
  assert.equal(await categoryCover.isVisible(), true, 'Girls cover image layer is hidden');
  const categoryCoverMetrics = await categoryCover.evaluate(image => {
    const rootBounds = document.querySelector('.l5rg-page').getBoundingClientRect();
    const bounds = image.getBoundingClientRect();
    return {
      src: new URL(image.currentSrc, location.href).pathname,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      x: +(bounds.left - rootBounds.left).toFixed(4),
      y: +(bounds.top - rootBounds.top).toFixed(4),
      width: +bounds.width.toFixed(4),
      height: +bounds.height.toFixed(4),
    };
  });
  assert.equal(categoryCoverMetrics.src, '/figma-assets/music-category-devichnik-figma.png');
  assert.equal(categoryCoverMetrics.complete, true);
  assert.equal(categoryCoverMetrics.naturalWidth, 960);
  assert.equal(categoryCoverMetrics.naturalHeight, 960);
  assert.ok(Math.abs(categoryCoverMetrics.x - 60) < 0.02, `Girls cover x drifted: ${categoryCoverMetrics.x}`);
  assert.ok(Math.abs(categoryCoverMetrics.y - 518.4309) < 0.02, `Girls cover y drifted: ${categoryCoverMetrics.y}`);
  assert.ok(Math.abs(categoryCoverMetrics.width - 960) < 0.02, `Girls cover width drifted: ${categoryCoverMetrics.width}`);
  assert.ok(Math.abs(categoryCoverMetrics.height - 960) < 0.02, `Girls cover height drifted: ${categoryCoverMetrics.height}`);
  const screenshot = path.join(profile, 'owned-girls-game.png');
  const actualCrop = path.join(profile, 'owned-girls-hero-actual.png');
  const oracleCrop = path.join(profile, 'owned-girls-hero-oracle.png');
  const hitsCrop = path.join(profile, 'owned-girls-hero-wrong-hits.png');
  await game.screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
  cropImage({ input: screenshot, geometry: GIRLS_HERO_SCREEN_GEOMETRY, output: actualCrop, root });
  cropImage({
    input: path.join(root, 'public', 'figma-assets', 'music-category-devichnik-figma.png'),
    geometry: GIRLS_HERO_ORACLE_GEOMETRY,
    output: oracleCrop,
    root,
  });
  cropImage({
    input: path.join(root, 'reference', 'layout5', 'cover.png'),
    geometry: GIRLS_HERO_SCREEN_GEOMETRY,
    output: hitsCrop,
    root,
  });
  const girlsRmse = normalizedRmse({ actual: actualCrop, reference: oracleCrop, root });
  const hitsRmse = normalizedRmse({ actual: actualCrop, reference: hitsCrop, root });
  assert.ok(
    girlsRmse < GIRLS_HERO_MAX_NORMALIZED_RMSE,
    `Visible game hero is not Girls: normalized RMSE ${girlsRmse} >= ${GIRLS_HERO_MAX_NORMALIZED_RMSE}`,
  );
  assert.ok(hitsRmse > 0.2, `Visible game hero still matches Hits Karaoke: normalized RMSE ${hitsRmse}`);
  assert.ok(girlsRmse * 4 < hitsRmse, `Girls hero is not materially closer to its oracle (${girlsRmse} vs Hits ${hitsRmse})`);

  await game.locator('.l5rg-hit[data-action="start"]').click();
  const playingGame = page.locator('.l5rg-page[data-state="playing"]');
  await playingGame.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('.l5rg-page[data-state="playing"]')?.dataset.imageComplete === 'true');
  const playingCategory = playingGame.locator('.l5rg-selected-category');
  assert.equal((await playingCategory.textContent()).trim(), 'Девичник');
  assert.equal(await playingGame.getAttribute('data-category-id'), 'girls');
  assert.equal(await playingGame.getAttribute('data-category-title'), 'Девичник');
  assert.equal(
    await playingGame.locator('.l5rg-hit[data-action="select-category"]').getAttribute('aria-label'),
    'Категория: Девичник. Сменить категорию',
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('bitva:layout5:karaoke-category')),
    'girls',
    'Starting Girls must preserve the selected category',
  );
  const playingScreenshot = path.join(profile, 'owned-girls-playing.png');
  await playingGame.screenshot({ path: playingScreenshot, animations: 'disabled', caret: 'hide', scale: 'device' });

  const media = await page.evaluate(() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
    playCalls: Number(window.__qaMediaPlayAttempts || 0),
  }));
  assert.deepEqual(media, { audio: 0, video: 0, playCalls: 0 }, 'Owned Girls flow caused media activity');
  assert.deepEqual(mediaRequests.slice(mediaRequestStart), [], 'Owned Girls flow requested media');
  return {
    categoryId: 'girls',
    categoryTitle: 'Девичник',
    categoryCover: categoryCoverMetrics.src,
    girlsRmse,
    hitsRmse,
    liveState: await playingGame.getAttribute('data-state'),
    media,
  };
}

async function fileExists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

function dedicatedBrowserPids(profile) {
  if (process.platform !== 'win32') return [];
  const escaped = profile.replace(/'/g, "''");
  const command = [
    '$items = Get-CimInstance Win32_Process | Where-Object {',
    "  $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -like '*" + escaped + "*'",
    '};', '$items | ForEach-Object { $_.ProcessId }',
  ].join(' ');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [`process-check-failed: ${result.stderr.trim()}`];
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/) : [];
}

async function waitForDedicatedBrowserExit(profile) {
  let pids = dedicatedBrowserPids(profile);
  for (let attempt = 0; attempt < 30 && pids.length; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    pids = dedicatedBrowserPids(profile);
  }
  return pids;
}

function portAcceptsConnections() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    socket.setTimeout(250);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPortRelease() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!await portAcceptsConnections()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-game-isolation-'));
  const { createServer } = await import('vite');
  let server;
  let context;
  let currentUser = makeUser();
  const purchaseRequests = [];
  const pageErrors = [];
  const badResponses = [];
  const mediaRequests = [];
  const checkedRoutes = new Set();
  let cleanup = null;
  let ownedGirlsRegression = null;
  let categoryCoverMatrix = null;
  let report = null;
  let runError = null;

  const resetUser = overrides => {
    currentUser = makeUser(overrides);
  };

  try {
    server = await createServer({
      root,
      cacheDir: path.join(profile, 'vite-cache'),
      server: { host: HOST, port: PORT, strictPort: true },
    });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking', '--autoplay-policy=user-gesture-required'],
    });

    await context.addInitScript(({ legacy }) => {
      localStorage.setItem('bitva_music_category', legacy.category);
      localStorage.setItem('bitva_music_song_index', legacy.index);
      localStorage.setItem('bitva_music_played_indexes', legacy.played);
      localStorage.setItem('bitva_music_show_category_cover', legacy.cover);
      const query = new URLSearchParams(window.location.search);
      if (query.has('authIntent')) localStorage.setItem('bitva_auth_intent', query.get('authIntent'));
      if (query.has('paymentIntent')) localStorage.setItem('bitva_payment_intent', query.get('paymentIntent'));
      window.__qaMediaPlayAttempts = 0;
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() {
          window.__qaMediaPlayAttempts += 1;
          this.pause();
          return Promise.resolve();
        },
      });
    }, { legacy: LEGACY_MUSIC_STATE });

    await context.route('https://cloud-api.yandex.net/**', route => json(route, {
      href: 'data:audio/mpeg;base64,SUQz',
    }));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/me') return json(route, { user: currentUser });
      if (pathname === '/api/purchases/entitlements' && request.method() === 'POST') {
        const body = request.postDataJSON();
        const entitlementId = body?.entitlementId;
        purchaseRequests.push(entitlementId);
        const price = ENTITLEMENT_PRICES[entitlementId];
        if (!price) return json(route, { error: { code: 'ENTITLEMENT_UNKNOWN', message: 'Unknown entitlement' } }, 400);
        if (currentUser.balanceCoins < price) {
          return json(route, { error: { code: 'INSUFFICIENT_FUNDS', message: 'У вас не хватает монет' } }, 402);
        }
        const alreadyOwned = currentUser.gameEntitlements.includes(entitlementId);
        if (!alreadyOwned) {
          currentUser = {
            ...currentUser,
            balanceCoins: currentUser.balanceCoins - price,
            gameEntitlements: [...currentUser.gameEntitlements, entitlementId],
          };
        }
        return json(route, { user: currentUser, alreadyOwned });
      }
      return json(route, { user: currentUser });
    });

    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a)$/i.test(url.pathname)) mediaRequests.push(request.url());
    });

    // Raster game frames contain the Figma fixture account. The live header must
    // cover it whenever the actual session is a guest or a different account.
    currentUser = null;
    await routeTo(page, 'karaoke-battle-game', '.l5rg-page');
    const guestHeader = page.locator('.l5rg-dynamic-nav');
    assert.equal(await guestHeader.count(), 1);
    assert.equal(await guestHeader.getByRole('button', { name: 'Войти', exact: true }).count(), 1);
    assert.equal(await guestHeader.locator('.nav-account').count(), 0);
    assert.equal(await page.locator('.l5rg-hit[data-action="balance"], .l5rg-hit[data-action="profile"]').count(), 0);
    const guestHeaderBox = await guestHeader.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        top: Number.parseFloat(style.top),
        left: Number.parseFloat(style.left),
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      };
    });
    assert.ok(Math.abs(guestHeaderBox.top - 107) < 0.02);
    assert.ok(Math.abs(guestHeaderBox.left - 60) < 0.02);
    assert.ok(Math.abs(guestHeaderBox.width - 960) < 0.02);
    assert.ok(Math.abs(guestHeaderBox.height - 123.431) < 0.02);
    await page.getByRole('button', { name: 'На главную: Караоке-битва' }).click();
    await waitForRoute(page, 'home');

    await routeTo(page, 'karaoke-battle-game', '.l5rg-page');
    await guestHeader.getByRole('button', { name: 'Войти', exact: true }).click();
    await waitForRoute(page, 'login');

    resetUser({ name: 'Варя', balanceCoins: 100 });
    await routeTo(page, 'karaoke-battle-game', '.l5rg-page');
    const accountHeader = page.locator('.l5rg-dynamic-nav');
    assert.equal(await accountHeader.count(), 1);
    assert.equal(await accountHeader.getByRole('button', { name: 'Открыть профиль' }).count(), 1);
    assert.equal(await accountHeader.getByText('100', { exact: true }).count(), 1);
    assert.equal(await accountHeader.getByText('В', { exact: true }).count(), 1);
    assert.equal(await accountHeader.getByText('11 240', { exact: true }).count(), 0);
    await accountHeader.getByRole('button', { name: 'Открыть профиль' }).click();
    await waitForRoute(page, 'profile');
    resetUser();

    // Music-loto remains its own game and never exposes Karaoke answer controls.
    await routeTo(page, 'music-game', '.music-game-page');
    checkedRoutes.add('music-game');
    assert.match(await page.locator('body').innerText(), /Музыкальное лото Дома/);
    assert.equal(await page.locator('.music-correct-toggle, .music-correct-answer-overlay').count(), 0);
    assert.equal(await page.getByText(/ПОКАЗАТЬ ПРАВИЛЬНЫЕ СЛОВА|СКРЫТЬ ПРАВИЛЬНЫЕ СЛОВА/).count(), 0);
    assert.equal(await page.locator('.l56-page[data-layout="5"], .l5p-page, .l5x-page, .l5rg-page').count(), 0);
    assert.doesNotMatch(page.url(), /karaoke/);
    await assertLegacyMusicUnchanged(page);

    // Layout 5 category cards follow the live Figma state even when reference raster mode is unavailable.
    resetUser({ balanceCoins: 11240, gameEntitlements: ['karaoke:girls', 'karaoke:qa-live'] });
    await routeTo(page, 'karaoke-battle', '.l56-page[data-render-mode="live"]');
    checkedRoutes.add('karaoke-battle');
    const categoryCards = await page.locator('.l56-catalog-section .l56-category').evaluateAll(cards => cards.map(card => ({
      title: card.querySelector('h3')?.textContent.trim(),
      action: card.querySelector('.l56-category-action')?.textContent.replace(/\s+/g, ' ').trim(),
      comingSoon: card.classList.contains('is-coming-soon'),
      width: card.getBoundingClientRect().width,
      height: card.getBoundingClientRect().height,
    })));
    assert.deepEqual(categoryCards.map(card => [card.title, card.action, card.comingSoon]), [
      ['Хиты караоке', 'Бесплатно', false],
      ['Хиты 90-х', '50 монет', false],
      ['Девичник', 'Играть', false],
      ['Хиты 2000-х', '50 монет', false],
    ]);
    assert.ok(categoryCards.every(card => Math.abs(card.width - card.height) < 0.1), 'Figma cards must remain square');
    const twoThousandsArtwork = page.locator('.l56-catalog-section img[src$="/generated/layout5/category-b3.png"]');
    assert.equal(await twoThousandsArtwork.count(), 1);
    assert.equal(await twoThousandsArtwork.evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.getByRole('button', { name: '50 монет' }).last().click();
    await waitForRoute(page, 'karaoke-battle-2000s-purchase-confirm');
    await assertLegacyMusicUnchanged(page);

    // Reproduce the exact reported path: the reference catalog with only Girls owned.
    // State-only assertions are insufficient because the old renderer kept showing the Hits raster.
    resetUser({ balanceCoins: 50, gameEntitlements: ['karaoke:girls'] });
    ownedGirlsRegression = await assertOwnedGirlsStartsVisibleGirls({ mediaRequests, page, profile, root });
    checkedRoutes.add('karaoke-battle-categories');
    await assertLegacyMusicUnchanged(page);

    // Every selectable category must preserve its own cover after entering the
    // game route; missing overlays used to fall back to Hits Karaoke.
    resetUser({
      balanceCoins: 200,
      gameEntitlements: ['karaoke:90s', 'karaoke:girls', 'karaoke:2000s'],
    });
    categoryCoverMatrix = await assertCategoryCoverMatrix({ mediaRequests, page, profile, root });
    await assertLegacyMusicUnchanged(page);

    // All purchase states are mounted through the real App router.
    for (const [route, expected] of Object.entries(PURCHASE_SCREENS)) {
      resetUser({ balanceCoins: route.includes('purchase-insufficient') ? 20 : 200 });
      await routeTo(page, route, `.${expected.className}`);
      checkedRoutes.add(route);
      await assertLayout5Screen(page, `.${expected.className}`, expected.node);
      await assertLegacyMusicUnchanged(page);
    }

    // Real 90s purchase: API -> persisted entitlement -> success -> correct Karaoke game.
    resetUser({ balanceCoins: 200 });
    await routeTo(page, 'karaoke-battle-purchase-confirm', '.l5p-page--confirm');
    await page.getByRole('button', { name: 'Оплатить 50 монет' }).click();
    await waitForRoute(page, 'karaoke-battle-purchase-success');
    assert.equal(purchaseRequests.at(-1), 'karaoke:90s');
    assert.equal(currentUser.balanceCoins, 150);
    assert.deepEqual(currentUser.gameEntitlements, ['karaoke:90s']);
    await page.getByRole('button', { name: 'Начать караоке-битву' }).click();
    await waitForRoute(page, 'karaoke-battle-game');
    assert.equal(await page.locator('.l5rg-page').count(), 1);
    await page.waitForFunction(() => localStorage.getItem('bitva:layout5:karaoke-category') === '90s');
    await assertLegacyMusicUnchanged(page);

    // Insufficient-funds state continues into top-up with the Karaoke payment intent.
    resetUser({ balanceCoins: 20 });
    await routeTo(page, 'karaoke-battle-purchase-insufficient', '.l5p-page--insufficient');
    await page.getByRole('button', { name: 'Пополнить баланс и оплатить 50 монет' }).click();
    await waitForRoute(page, 'balance-top-up');
    await page.waitForFunction(() => localStorage.getItem('bitva_payment_intent') === 'karaoke-90s');
    assert.match(await page.locator('body').innerText(), /30\s*₽/);
    await assertLegacyMusicUnchanged(page);

    // 2000s is an active Figma category with its own purchase intent and entitlement.
    resetUser({ balanceCoins: 200 });
    await routeTo(page, 'karaoke-battle-2000s-purchase-confirm', '.l5p-page--confirm');
    await page.getByRole('button', { name: 'Оплатить 50 монет' }).click();
    await waitForRoute(page, 'karaoke-battle-2000s-purchase-success');
    assert.equal(purchaseRequests.at(-1), 'karaoke:2000s');
    assert.equal(currentUser.balanceCoins, 150);
    assert.deepEqual(currentUser.gameEntitlements, ['karaoke:2000s']);
    await page.getByRole('button', { name: 'Начать караоке-битву' }).click();
    await waitForRoute(page, 'karaoke-battle-game');
    await page.waitForFunction(() => localStorage.getItem('bitva:layout5:karaoke-category') === '2000s');
    await assertLegacyMusicUnchanged(page);

    // Girls buys a separate entitlement and opens Layout 5, never music-loto.
    resetUser({ balanceCoins: 200 });
    await routeTo(page, 'karaoke-battle-girls-cover', '.l5p-page--girls');
    await page.getByRole('button', { name: 'Купить категорию Девичник за 50 монет' }).click();
    await waitForRoute(page, 'karaoke-battle-game');
    assert.equal(purchaseRequests.at(-1), 'karaoke:girls');
    assert.equal(currentUser.balanceCoins, 150);
    assert.deepEqual(currentUser.gameEntitlements, ['karaoke:girls']);
    assert.equal(await page.locator('.l5rg-page').count(), 1);
    assert.equal(await page.locator('.music-game-page').count(), 0);
    await page.waitForFunction(() => localStorage.getItem('bitva:layout5:karaoke-category') === 'girls');
    await assertLegacyMusicUnchanged(page);

    // Every extra Figma state is wired into the real router with the correct node and dimensions.
    resetUser({
      name: 'Владимир',
      balanceCoins: 11240,
      purchasedBlanks: [{ id: 'qa-blank', category: 'Девичник', count: 2, date: '01.01.2026', packSeed: 'qa', createdAt: '2026-01-01T00:00:00.000Z' }],
      purchasedMusicCategories: [],
      gameEntitlements: ['karaoke:girls', 'karaoke:2000s', 'karaoke:girls', 'royal:birthday'],
    });
    for (const [route, expected] of Object.entries(EXTRA_SCREENS)) {
      await page.setViewportSize(route.includes('landscape') ? { width: 1280, height: 800 } : { width: 390, height: 844 });
      await routeTo(page, route, '.l5x-page');
      checkedRoutes.add(route);
      await assertLayout5Screen(page, '.l5x-page', expected.node);
      const dimensions = await page.locator('.l5x-page').evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight }));
      assert.deepEqual(dimensions, { width: expected.width, height: expected.height });
      if (route === 'karaoke-battle-purchases') {
        const purchaseLayout = await page.locator('.l5x-purchase-overview').evaluate(element => {
          const cards = [...element.querySelectorAll('.l5x-purchase-live-card')];
          const lastCard = cards.at(-1);
          const showAll = element.querySelector('.l5x-purchase-show-all');
          const balance = document.querySelector('.l5x-purchase-balance');
          const balanceCoin = balance?.querySelector('.l5x-purchase-balance-coin');
          const balanceCoinCrop = balance?.querySelector('.l5x-purchase-balance-coin-crop');
          const balanceCoinImage = balanceCoinCrop?.querySelector('img');
          const balanceText = balance?.querySelector('strong');
          const round = (value, precision = 1) => {
            const factor = 10 ** precision;
            return Math.round(Number.parseFloat(value) * factor) / factor;
          };
          const cardStyles = cards.map(card => getComputedStyle(card));
          const artStyles = cards.map(card => getComputedStyle(card.querySelector('.l5x-purchase-live-art')));
          const balanceStyle = getComputedStyle(balance);
          const balanceCoinStyle = getComputedStyle(balanceCoin);
          const balanceCoinCropStyle = getComputedStyle(balanceCoinCrop);
          const balanceCoinImageStyle = getComputedStyle(balanceCoinImage);
          const balanceTextStyle = getComputedStyle(balanceText);
          return {
            cardCount: cards.length,
            cardTops: cards.map(card => card.offsetTop),
            cardSizes: cardStyles.map(style => [round(style.width), round(style.height)]),
            purchaseIds: cards.map(card => card.dataset.purchaseId),
            ariaLabels: cards.map(card => card.getAttribute('aria-label')),
            artSources: cards.map(card => card.querySelector('.l5x-purchase-live-art')?.getAttribute('src')),
            artPresentation: artStyles.map(style => ({
              width: round(style.width),
              height: round(style.height),
              top: round(style.top),
              left: round(style.left),
              opacity: style.opacity,
              filter: style.filter,
              maskImage: style.maskImage,
              mixBlendMode: style.mixBlendMode,
              objectFit: style.objectFit,
            })),
            cardBackgroundColors: cardStyles.map(style => style.backgroundColor),
            cardBackgroundImages: cardStyles.map(style => style.backgroundImage),
            gapAfterCard: round(Number.parseFloat(getComputedStyle(element).gap) + Number.parseFloat(getComputedStyle(showAll).marginTop)),
            overlayTop: element.offsetTop,
            overlayBottom: element.offsetTop + element.offsetHeight,
            cardsFullyVisible: cards.every(card => card.offsetTop >= 0 && card.offsetTop + card.offsetHeight <= element.clientHeight),
            showAllFullyVisible: showAll.offsetTop >= 0 && showAll.offsetTop + showAll.offsetHeight <= element.clientHeight,
            showAllHeight: showAll.offsetHeight,
            showAllText: showAll.textContent.trim(),
            showAllDisabled: showAll.disabled,
            balance: {
              width: round(balanceStyle.width),
              height: round(balanceStyle.height),
              radius: round(balanceStyle.borderRadius),
              backgroundImage: balanceStyle.backgroundImage,
              coin: [round(balanceCoinStyle.width), round(balanceCoinStyle.height)],
              coinCrop: [round(balanceCoinCropStyle.width), round(balanceCoinCropStyle.height)],
              coinImage: [round(balanceCoinImageStyle.width), round(balanceCoinImageStyle.height)],
              coinImagePosition: [round(balanceCoinImageStyle.left), round(balanceCoinImageStyle.top)],
              textColor: balanceTextStyle.color,
              textSize: round(balanceTextStyle.fontSize),
              textWeight: balanceTextStyle.fontWeight,
            },
          };
        });
        const {
          artSources,
          artPresentation,
          balance: purchaseBalance,
          cardBackgroundColors,
          cardBackgroundImages,
          ...purchaseLayoutMetrics
        } = purchaseLayout;
        assert.deepEqual(purchaseLayoutMetrics, {
          cardCount: 3,
          cardTops: [0, 294, 587],
          cardSizes: [[969, 265.6], [969, 265.6], [969, 265.6]],
          purchaseIds: ['loto', 'karaoke', 'royal'],
          ariaLabels: [
            'Мои бланки музыкального лото',
            'Мои категории караоке-битвы',
            'Мои сборники королевской битвы',
          ],
          gapAfterCard: 40,
          overlayTop: 517,
          overlayBottom: 1736,
          cardsFullyVisible: true,
          showAllFullyVisible: true,
          showAllHeight: 108,
          showAllText: 'Показать все покупки',
          showAllDisabled: true,
        });
        assert.match(artSources[0], /purchase-loto-figma\.png/);
        assert.match(artSources[1], /purchase-karaoke-figma\.png/);
        assert.match(artSources[2], /purchase-royal-figma\.png/);
        assert.deepEqual(artPresentation, [
          { width: 969, height: 265.6, top: 0, left: 0, opacity: '1', filter: 'none', maskImage: 'none', mixBlendMode: 'normal', objectFit: 'fill' },
          { width: 969, height: 265.6, top: 0, left: 0, opacity: '1', filter: 'none', maskImage: 'none', mixBlendMode: 'normal', objectFit: 'fill' },
          { width: 969, height: 265.6, top: 0, left: 0, opacity: '1', filter: 'none', maskImage: 'none', mixBlendMode: 'normal', objectFit: 'fill' },
        ]);
        assert.deepEqual(cardBackgroundColors, ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
        assert.deepEqual(cardBackgroundImages, ['none', 'none', 'none']);
        assert.deepEqual({ ...purchaseBalance, backgroundImage: undefined }, {
          width: 217,
          height: 81.9,
          radius: 743.7,
          backgroundImage: undefined,
          coin: [70.7, 67.3],
          coinCrop: [69.9, 66.6],
          coinImage: [55, 58],
          coinImagePosition: [9.2, 2.4],
          textColor: 'rgb(209, 209, 209)',
          textSize: 41,
          textWeight: '600',
        });
        assert.match(purchaseBalance.backgroundImage, /linear-gradient\(-48\.4417deg/);
        assert.match(purchaseBalance.backgroundImage, /rgb\(35, 35, 35\).*rgb\(66, 66, 66\)/);
      }
      await assertLegacyMusicUnchanged(page);
    }

    // Purchased Karaoke categories are grouped into one Figma card and do not silently select a category.
    resetUser({ balanceCoins: 0, gameEntitlements: ['karaoke:girls', 'karaoke:2000s', 'karaoke:girls'] });
    await page.evaluate(() => localStorage.setItem('bitva:layout5:karaoke-category', '2000s'));
    await routeTo(page, 'karaoke-battle-purchases', '.l5x-purchase-overview');
    assert.equal(await page.locator('[data-purchase-id="karaoke"]').count(), 1);
    await page.getByRole('button', { name: 'Мои категории караоке-битвы' }).click();
    await waitForRoute(page, 'karaoke-battle-categories');
    assert.equal(await page.evaluate(() => localStorage.getItem('bitva:layout5:karaoke-category')), '2000s');
    await assertLegacyMusicUnchanged(page);

    // Played songs are real session state: counter, ordered cards and scroll all
    // come from the songs that actually left the game stage.
    await routeTo(page, 'karaoke-battle-game', '.l5rg-page');
    await page.locator('.l5rg-hit[data-action="start"]').click();
    for (let index = 0; index < 5; index += 1) {
      await page.locator('.l5rg-hit[data-action="new-song"]').click();
    }
    assert.equal(await page.locator('.l5rg-played-count').textContent(), '5');
    assert.equal(await page.locator('.l5rg-hit[data-action="played-songs"]').getAttribute('aria-label'), 'Выпавшие песни: 5');
    await page.locator('.l5rg-hit[data-action="played-songs"]').click();
    await waitForRoute(page, 'karaoke-battle-viewed-songs');
    const viewedMetrics = await page.locator('.l5x-viewed-live-list').evaluate(element => ({
      count: element.dataset.playedCount,
      cards: element.querySelectorAll('.l5x-viewed-live-card').length,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    assert.equal(viewedMetrics.count, '5');
    assert.equal(viewedMetrics.cards, 5);
    assert.ok(viewedMetrics.scrollHeight > viewedMetrics.clientHeight);
    await page.getByRole('button', { name: /Открыть выпавшую песню 2: Корни — Ты узнаешь её/ }).click();
    await waitForRoute(page, 'karaoke-battle-game');
    assert.equal(await page.locator('.l5rg-page').getAttribute('data-song-variant'), 'secondary');
    assert.equal(await page.locator('.l5rg-played-count').textContent(), '5');

    await routeTo(page, 'karaoke-battle-song-list', '.l5x-page');
    await page.getByRole('button', { name: 'Закрыть список песен' }).first().click();
    await waitForRoute(page, 'karaoke-battle-categories');

    resetUser({
      balanceCoins: 11240,
      purchasedBlanks: [{ id: 'qa-blank', category: 'Девичник', count: 2, date: '01.01.2026', packSeed: 'qa', createdAt: '2026-01-01T00:00:00.000Z' }],
      gameEntitlements: ['karaoke:girls', 'royal:birthday'],
    });
    for (const [label, destination] of [
      ['Мои бланки музыкального лото', 'music-blanks'],
      ['Мои категории караоке-битвы', 'karaoke-battle-categories'],
      ['Мои сборники королевской битвы', 'royal-battle-collections'],
    ]) {
      await routeTo(page, 'karaoke-battle-purchases', '.l5x-page');
      await page.getByRole('button', { name: label }).click();
      await waitForRoute(page, destination);
    }

    for (const [route, hiddenDestination] of [
      ['karaoke-battle-fullscreen-portrait-hidden', 'karaoke-battle-fullscreen-portrait-hidden'],
      ['karaoke-battle-fullscreen-portrait-answers', 'karaoke-battle-fullscreen-portrait-hidden'],
      ['karaoke-battle-fullscreen-landscape-hidden', 'karaoke-battle-fullscreen-landscape-hidden'],
      ['karaoke-battle-fullscreen-landscape-answers', 'karaoke-battle-fullscreen-landscape-hidden'],
    ]) {
      await page.setViewportSize(route.includes('landscape') ? { width: 1280, height: 800 } : { width: 390, height: 844 });
      await routeTo(page, route, '.l5x-page--fullscreen');
      await page.getByRole('button', { name: 'Новая песня' }).click();
      await waitForRoute(page, hiddenDestination);
      assert.equal(await page.locator('.l5x-page--fullscreen').count(), 1);
      await page.getByRole('button', { name: 'Пауза' }).click();
      await page.getByRole('button', { name: 'Выйти из полноэкранного режима' }).click();
      await waitForRoute(page, 'karaoke-battle-game');
      assert.equal(await page.locator('.l5rg-page').count(), 1);
      await assertLegacyMusicUnchanged(page);
    }

    // Legacy URLs are aliases only; they may not mount the removed old implementation.
    await routeTo(page, 'karaoke-game', '.l5rg-page');
    assert.match(page.url(), /#\/karaoke-battle-game$/);
    assert.equal(await page.locator('.music-game-page, .karaoke-game-page').count(), 0);
    await assertLegacyMusicUnchanged(page);

    // Seven Layout 5 auth-success matrices: exact actions/copy and compact state.
    resetUser({ balanceCoins: 11240 });
    for (const authCase of AUTH_SUCCESS_CASES) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(({ intent, payment }) => {
        localStorage.setItem('bitva_auth_intent', intent);
        localStorage.setItem('bitva_payment_intent', payment);
      }, { intent: authCase.intent, payment: authCase.payment });
      await routeTo(page, authCase.route, '.l5a-page', {
        authIntent: authCase.intent,
        paymentIntent: authCase.payment,
      });
      const authRoot = page.locator('.l5a-page');
      await assertLayout5Screen(page, '.l5a-page', authCase.node);
      assert.equal(await authRoot.getAttribute('data-render-mode'), 'figma-reference', authCase.name);
      assert.equal(await authRoot.locator('.l5a-primary').getAttribute('aria-label'), authCase.primary, authCase.name);
      assert.equal(await authRoot.locator('.l5a-secondary').count(), authCase.secondary ? 1 : 0, authCase.name);
      if (authCase.secondary) {
        assert.equal(await authRoot.locator('.l5a-secondary').getAttribute('aria-label'), authCase.secondary, authCase.name);
      }
      await assertLegacyMusicUnchanged(page);
    }

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(badResponses, []);
    assert.deepEqual(mediaRequests, []);
    report = {
      status: 'PASS',
      checkedRoutes: checkedRoutes.size,
      purchaseRoutes: Object.keys(PURCHASE_SCREENS).length,
      extraRoutes: Object.keys(EXTRA_SCREENS).length,
      authSuccessCases: AUTH_SUCCESS_CASES.length,
      purchases: purchaseRequests,
      musicCorrectWords: false,
      legacyAlias: true,
      stateIsolation: true,
      ownedGirlsRegression,
      categoryCoverMatrix,
      mediaRequests: mediaRequests.length,
      pageErrors,
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    try { await context?.close(); } catch (error) { cleanupErrors.push(`browser close: ${error.message}`); }
    try { await server?.close(); } catch (error) { cleanupErrors.push(`server close: ${error.message}`); }
    const remainingPids = await waitForDedicatedBrowserExit(profile);
    if (remainingPids.length) cleanupErrors.push(`dedicated browser processes: ${remainingPids.join(', ')}`);
    const portReleased = await waitForPortRelease();
    if (!portReleased) cleanupErrors.push(`Vite port ${PORT} is still accepting connections`);
    const safeProfile = path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith(PROFILE_PREFIX);
    if (!safeProfile) {
      cleanupErrors.push(`refusing to remove unexpected browser profile: ${profile}`);
    } else {
      try { await fs.rm(profile, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(`profile removal: ${error.message}`); }
    }
    const profileRemoved = safeProfile && !await fileExists(profile);
    if (!profileRemoved) cleanupErrors.push(`profile remains at ${profile}`);
    cleanup = { profile, browserPids: remainingPids, profileRemoved, serverPortReleased: portReleased };
    if (cleanupErrors.length) {
      const cleanupError = new Error(`QA cleanup failed: ${cleanupErrors.join('; ')}`);
      runError = runError ? new AggregateError([runError, cleanupError], 'QA and cleanup failed') : cleanupError;
    }
  }

  if (runError) throw runError;
  console.log(JSON.stringify({ ...report, cleanup }));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
