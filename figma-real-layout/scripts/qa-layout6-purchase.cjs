const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:5298';
const REFERENCE_WIDTH = 1080;
const VIEWPORTS = Object.freeze([390, 768, REFERENCE_WIDTH, 1440]);
const CASES = Object.freeze([
  {
    mode: 'insufficient',
    route: 'royal-battle-collection-purchase',
    node: '1:978',
    height: 2680,
    balance: 0,
    reference: 'purchase-insufficient.png',
    routes: {
      back: 'royal-battle-collection-birthday',
      account: 'profile',
      'top-up': 'balance-top-up',
      'footer-home': 'home',
      'footer-privacy': 'privacy',
    },
  },
  {
    mode: 'confirm',
    route: 'royal-battle-collection-confirm',
    node: '1:1024',
    height: 2680,
    balance: 0,
    reference: 'purchase-confirm.png',
    routes: {
      back: 'royal-battle-collection-birthday',
      account: 'profile',
      'confirm-purchase': 'royal-battle-collection-success',
      'footer-home': 'home',
      'footer-privacy': 'privacy',
    },
  },
  {
    mode: 'success',
    route: 'royal-battle-collection-success',
    node: '1:810',
    height: 2564,
    balance: 11240,
    entitlements: ['royal:birthday'],
    reference: 'purchase-success.png',
    routes: {
      back: 'royal-battle-collection-birthday',
      account: 'profile',
      start: 'royal-battle-game',
      'return-to-game': 'royal-battle-collection-birthday',
      'footer-home': 'home',
      'footer-privacy': 'privacy',
    },
  },
]);

function makeUser({ balance = 0, entitlements = [], name = 'Тимур' } = {}) {
  return {
    id: 'layout6-purchase-exact-qa',
    name,
    email: 'qa@example.test',
    balanceCoins: balance,
    purchasedBlanks: [],
    purchasedCategories: [],
    gameEntitlements: [...entitlements],
  };
}

function userFor(testCase) {
  return makeUser({ balance: testCase.balance, entitlements: testCase.entitlements || [] });
}

function fulfillJson(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

function assertImageMagick(root) {
  const probe = spawnSync('magick', ['-version'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, `ImageMagick is required: ${probe.error || probe.stderr}`);
}

function identify(image, root) {
  const result = spawnSync('magick', ['identify', '-format', '%w %h', image], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `Unable to identify ${image}: ${result.error || result.stderr}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  return { width, height };
}

function compareRawPixels({ actual, diff, reference, root }) {
  const result = spawnSync('magick', [
    'compare', '-metric', 'AE', '-fuzz', '0%', reference, actual, diff,
  ], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.ok([0, 1].includes(result.status), `ImageMagick compare failed: ${result.error || result.stderr}`);
  const metric = String(result.stderr || result.stdout).trim();
  const changedPixels = Number.parseFloat(metric.match(/[\d.]+/)?.[0]);
  assert.ok(Number.isFinite(changedPixels), `Unreadable AE metric: ${metric}`);
  return changedPixels;
}

async function waitForPage(page) {
  await page.locator('.l6p-page').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.l6p-page img')].map(async image => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }
      await image.decode();
    }));
  });
}

async function exposeNaturalCanvas(page) {
  await page.locator('.l6p-page').evaluate(element => {
    element.style.setProperty('--canvas-target-width', '1080px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.l6p-page');
    return root && Math.abs(root.getBoundingClientRect().width - 1080) < 0.01;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

let navigationId = 0;
async function navigate(page, route) {
  navigationId += 1;
  await page.goto(`${BASE_URL}/?layout6PurchaseQa=${navigationId}#/${route}`, { waitUntil: 'networkidle' });
}

async function metrics(page) {
  return page.locator('.l6p-page').evaluate(root => {
    const bounds = root.getBoundingClientRect();
    const referenceImages = [...root.querySelectorAll('img[data-figma-reference]')];
    return {
      dpr: window.devicePixelRatio,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      width: bounds.width,
      offsetHeight: root.offsetHeight,
      renderMode: root.dataset.renderMode,
      figmaNode: root.dataset.figmaNode,
      referenceImages: referenceImages.map(image => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height,
      })),
      missingImages: [...root.querySelectorAll('img')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.currentSrc || image.getAttribute('src')),
    };
  });
}

async function assertVisualCase({ currentUser, page, root, output, testCase }) {
  const viewports = [];
  let changedPixels;
  for (const width of VIEWPORTS) {
    currentUser.value = userFor(testCase);
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, testCase.route);
    await waitForPage(page);
    if (width === REFERENCE_WIDTH) await exposeNaturalCanvas(page);
    const current = await metrics(page);
    assert.equal(current.dpr, 1);
    assert.equal(current.renderMode, 'figma-reference', `${testCase.mode} must use reference mode`);
    assert.equal(current.figmaNode, testCase.node);
    assert.deepEqual(current.missingImages, []);
    assert.equal(current.referenceImages.length, 1);
    assert.equal(current.referenceImages[0].naturalWidth, REFERENCE_WIDTH);
    assert.equal(current.referenceImages[0].naturalHeight, testCase.height);
    assert.ok(current.documentWidth <= width, `Document overflow @${width}: ${current.documentWidth}`);
    assert.ok(current.bodyWidth <= width, `Body overflow @${width}: ${current.bodyWidth}`);
    assert.ok(current.width <= width + 0.01, `Root overflow @${width}: ${current.width}`);

    const screenshot = path.join(output, `${testCase.mode}-${width}.png`);
    await page.locator('.l6p-page').screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
    if (width === REFERENCE_WIDTH) {
      assert.equal(current.width, REFERENCE_WIDTH);
      assert.equal(current.offsetHeight, testCase.height);
      assert.equal(current.referenceImages[0].width, REFERENCE_WIDTH);
      assert.equal(current.referenceImages[0].height, testCase.height);
      assert.deepEqual(identify(screenshot, root), { width: REFERENCE_WIDTH, height: testCase.height });
      const reference = path.join(root, 'reference', 'layout6', testCase.reference);
      assert.deepEqual(identify(reference, root), { width: REFERENCE_WIDTH, height: testCase.height });
      changedPixels = compareRawPixels({
        actual: screenshot,
        diff: path.join(output, `${testCase.mode}-raw-diff.png`),
        reference,
        root,
      });
      assert.equal(changedPixels, 0, `${testCase.mode} differs by ${changedPixels} raw pixels`);
    }
    viewports.push({ viewport: width, ...current, screenshot: path.relative(root, screenshot) });
  }
  return { changedPixels, viewports };
}

async function assertInteractions({ currentUser, page, testCase }) {
  currentUser.value = userFor(testCase);
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, testCase.route);
  await waitForPage(page);
  await exposeNaturalCanvas(page);
  const inventory = await page.locator('[data-reference-hotspot]').evaluateAll(nodes => nodes.map(node => ({
    id: node.dataset.referenceHotspot,
    label: node.getAttribute('aria-label'),
    disabled: node.disabled,
  })));
  assert.equal(new Set(inventory.map(item => item.id)).size, inventory.length, 'Hotspot ids must be unique');
  assert.ok(inventory.every(item => item.id && item.label && !item.disabled), 'Every purchase hotspot must be enabled and named');

  const clicked = [];
  for (const [hotspot, targetRoute] of Object.entries(testCase.routes)) {
    currentUser.value = userFor(testCase);
    await navigate(page, testCase.route);
    await waitForPage(page);
    await exposeNaturalCanvas(page);
    const button = page.locator(`[data-reference-hotspot="${hotspot}"]`);
    await button.click();
    const expectedHash = targetRoute === 'home' ? '#/' : `#/${targetRoute}`;
    await page.waitForURL(url => url.hash === expectedHash);
    clicked.push({ hotspot, targetRoute, url: page.url() });
  }
  return { inventory, clicked };
}

async function assertLiveFallback({ currentUser, page }) {
  const fixtures = [
    { route: 'royal-battle-collection-purchase', user: makeUser({ balance: 50 }) },
    { route: 'royal-battle-collection-confirm', user: makeUser({ balance: 11240 }) },
    { route: 'royal-battle-collection-success', user: makeUser({ balance: 100, entitlements: ['royal:birthday'] }) },
  ];
  const checks = [];
  for (const fixture of fixtures) {
    currentUser.value = fixture.user;
    await navigate(page, fixture.route);
    await waitForPage(page);
    const root = page.locator('.l6p-page');
    assert.equal(await root.getAttribute('data-render-mode'), 'live');
    assert.equal(await root.locator('img[data-figma-reference]').count(), 0);
    assert.equal(await root.locator('.l6p-stack').count(), 1);
    checks.push({ route: fixture.route, balance: fixture.user.balanceCoins });
  }
  return checks;
}

function dedicatedBrowserPids(profile) {
  if (process.platform !== 'win32') return [];
  const escaped = profile.replace(/'/g, "''");
  const command = [
    '$items = Get-CimInstance Win32_Process | Where-Object {',
    "  $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -like '*" + escaped + "*'",
    '};',
    '$items | ForEach-Object { $_.ProcessId }',
  ].join(' ');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
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

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa', 'layout6-purchase-exact');
  const profile = path.join(output, '.browser-profile');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(profile, { recursive: true });
  assertImageMagick(root);

  const { createServer } = await import('vite');
  const currentUser = { value: makeUser() };
  const errors = [];
  const badResponses = [];
  const mediaRequests = [];
  const reports = [];
  let server;
  let context;

  try {
    server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5298, strictPort: true } });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: REFERENCE_WIDTH, height: 900 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--force-color-profile=srgb'],
    });
    await context.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() { this.pause(); return Promise.resolve(); },
      });
    });
    await context.route('**/api/**', route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'POST' && pathname.endsWith('/purchases/entitlements')) {
        currentUser.value = makeUser({ balance: 11240, entitlements: ['royal:birthday'] });
        return fulfillJson(route, {
          user: currentUser.value,
          entitlementId: 'royal:birthday',
          alreadyOwned: false,
        });
      }
      return fulfillJson(route, { user: currentUser.value });
    });

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a)$/i.test(pathname)) mediaRequests.push(request.url());
    });

    for (const testCase of CASES) {
      const visual = await assertVisualCase({ currentUser, page, root, output, testCase });
      const interactions = await assertInteractions({ currentUser, page, testCase });
      reports.push({ ...testCase, ...visual, ...interactions });
    }
    const liveFallback = await assertLiveFallback({ currentUser, page });
    assert.deepEqual(errors, []);
    assert.deepEqual(badResponses, []);
    assert.deepEqual(mediaRequests, []);

    const report = {
      checkedAt: new Date().toISOString(),
      renderer: 'figma-reference',
      dpr: 1,
      errors,
      badResponses,
      mediaRequests,
      liveFallback,
      pages: reports,
    };
    await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      status: 'PASS',
      pages: reports.length,
      responsiveScreenshots: reports.reduce((sum, item) => sum + item.viewports.length, 0),
      changedPixels: reports.map(item => ({ mode: item.mode, changedPixels: item.changedPixels })),
      interactions: reports.reduce((sum, item) => sum + item.clicked.length, 0),
      liveFallback: liveFallback.length,
      mediaRequests: mediaRequests.length,
      errors,
    }));
  } finally {
    await context?.close();
    await server?.close();
    const remainingPids = await waitForDedicatedBrowserExit(profile);
    if (remainingPids.length) {
      console.error(`Dedicated browser process cleanup failed: ${remainingPids.join(', ')}`);
      process.exitCode = 1;
    }
    await fs.rm(profile, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
