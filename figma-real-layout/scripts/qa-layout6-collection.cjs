const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:5197';
const REFERENCE_WIDTH = 1080;
const REFERENCE_HEIGHT = 5546;
const VIEWPORTS = Object.freeze([390, 768, REFERENCE_WIDTH, 1440]);
const CASES = Object.freeze([
  {
    collection: 'party',
    route: 'royal-battle-collection-party',
    node: '1:733',
    reference: 'free-collection.png',
    disabled: [],
    comingSoon: ['start', 'management-tasks', 'management-winner', 'management-new-game'],
    routes: {
      back: 'royal-battle-collections',
      account: 'profile',
      'props-buy': 'royal-battle-props',
      'management-collections': 'royal-battle-collections',
      'footer-home': 'home',
      'footer-privacy': 'privacy',
    },
  },
  {
    collection: 'birthday',
    route: 'royal-battle-collection-birthday',
    node: '1:771',
    reference: 'paid-collection.png',
    disabled: ['start'],
    comingSoon: ['management-winner'],
    routes: {
      back: 'royal-battle-collections',
      account: 'profile',
      'collection-buy': 'royal-battle-collection-confirm',
      'props-buy': 'royal-battle-props',
      'management-collections': 'royal-battle-collections',
      'management-tasks': 'royal-battle-collection-confirm',
      'management-new-game': 'royal-battle-collection-confirm',
      'footer-home': 'home',
      'footer-privacy': 'privacy',
    },
  },
]);

function makeUser({ balance = 11240, entitlements = [], name = 'Тимур' } = {}) {
  return {
    id: 'layout6-collection-exact-qa',
    name,
    email: 'qa@example.test',
    balanceCoins: balance,
    purchasedBlanks: [],
    purchasedCategories: [],
    gameEntitlements: [...entitlements],
  };
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
  await page.locator('.l6c-page').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.l6c-page img')].map(async image => {
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
  await page.locator('.l6c-page').evaluate(element => {
    element.style.setProperty('--canvas-target-width', '1080px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.l6c-page');
    return root && Math.abs(root.getBoundingClientRect().width - 1080) < 0.01;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

let navigationId = 0;
async function navigate(page, route) {
  navigationId += 1;
  await page.goto(`${BASE_URL}/?layout6CollectionQa=${navigationId}#/${route}`, { waitUntil: 'networkidle' });
}

async function metrics(page) {
  return page.locator('.l6c-page').evaluate(root => {
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

async function assertVisualCase({ page, root, output, testCase }) {
  const viewports = [];
  let changedPixels;
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, testCase.route);
    await waitForPage(page);
    if (width === REFERENCE_WIDTH) await exposeNaturalCanvas(page);
    const current = await metrics(page);
    assert.equal(current.dpr, 1);
    assert.equal(current.renderMode, 'figma-reference', `${testCase.collection} must use reference mode`);
    assert.equal(current.figmaNode, testCase.node);
    assert.deepEqual(current.missingImages, []);
    assert.equal(current.referenceImages.length, 1);
    assert.equal(current.referenceImages[0].naturalWidth, REFERENCE_WIDTH);
    assert.equal(current.referenceImages[0].naturalHeight, REFERENCE_HEIGHT);
    assert.ok(current.documentWidth <= width, `Document overflow @${width}: ${current.documentWidth}`);
    assert.ok(current.bodyWidth <= width, `Body overflow @${width}: ${current.bodyWidth}`);
    assert.ok(current.width <= width + 0.01, `Root overflow @${width}: ${current.width}`);

    const screenshot = path.join(output, `${testCase.collection}-${width}.png`);
    await page.locator('.l6c-page').screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
    if (width === REFERENCE_WIDTH) {
      assert.equal(current.width, REFERENCE_WIDTH);
      assert.equal(current.offsetHeight, REFERENCE_HEIGHT);
      assert.equal(current.referenceImages[0].width, REFERENCE_WIDTH);
      assert.equal(current.referenceImages[0].height, REFERENCE_HEIGHT);
      assert.deepEqual(identify(screenshot, root), { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT });
      const reference = path.join(root, 'reference', 'layout6', testCase.reference);
      assert.deepEqual(identify(reference, root), { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT });
      changedPixels = compareRawPixels({
        actual: screenshot,
        diff: path.join(output, `${testCase.collection}-raw-diff.png`),
        reference,
        root,
      });
      assert.equal(changedPixels, 0, `${testCase.collection} differs by ${changedPixels} raw pixels`);
    }
    viewports.push({ viewport: width, ...current, screenshot: path.relative(root, screenshot) });
  }
  return { changedPixels, viewports };
}

async function assertInteractions({ currentUser, page, testCase }) {
  currentUser.value = makeUser();
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, testCase.route);
  await waitForPage(page);
  await exposeNaturalCanvas(page);
  const inventory = await page.locator('[data-reference-hotspot]').evaluateAll(nodes => nodes.map(node => ({
    id: node.dataset.referenceHotspot,
    label: node.getAttribute('aria-label'),
    disabled: node.disabled,
    ariaDisabled: node.getAttribute('aria-disabled') === 'true',
  })));
  assert.equal(new Set(inventory.map(item => item.id)).size, inventory.length, 'Hotspot ids must be unique');
  assert.deepEqual(inventory.filter(item => item.disabled).map(item => item.id), testCase.disabled);
  assert.deepEqual(inventory.filter(item => item.ariaDisabled).map(item => item.id), testCase.comingSoon);
  assert.ok(inventory.every(item => item.id && item.label), 'Every hotspot needs a stable id and accessible name');

  const clicked = [];
  for (const [hotspot, targetRoute] of Object.entries(testCase.routes)) {
    currentUser.value = makeUser();
    await navigate(page, testCase.route);
    await waitForPage(page);
    await exposeNaturalCanvas(page);
    const button = page.locator(`[data-reference-hotspot="${hotspot}"]`);
    await button.click();
    const expectedHash = targetRoute === 'home' ? '#/' : `#/${targetRoute}`;
    await page.waitForURL(url => url.hash === expectedHash);
    clicked.push({ hotspot, targetRoute, url: page.url() });
  }
  for (const hotspot of testCase.comingSoon) {
    currentUser.value = makeUser();
    await navigate(page, testCase.route);
    await waitForPage(page);
    await exposeNaturalCanvas(page);
    const button = page.locator(`[data-reference-hotspot="${hotspot}"]`);
    assert.equal(await button.getAttribute('aria-disabled'), 'true');
    const before = new URL(page.url()).hash;
    await button.evaluate(node => node.click());
    assert.equal(new URL(page.url()).hash, before, `${hotspot} must stay on the current collection card/screen`);
    assert.equal(await page.locator('.l6s-page--unavailable').count(), 0, 'Obsolete standalone placeholder must not render');
    clicked.push({ hotspot, targetState: 'coming-soon', url: page.url() });
  }
  return { inventory, clicked };
}

async function assertLiveFallback({ currentUser, output, page }) {
  const checks = [];
  await page.setViewportSize({ width: 390, height: 844 });
  for (const fixture of [
    { route: 'royal-battle-collection-party', user: makeUser({ balance: 100, name: 'Алексей' }) },
    { route: 'royal-battle-collection-birthday', user: makeUser({ entitlements: ['royal:birthday'] }) },
  ]) {
    currentUser.value = fixture.user;
    await navigate(page, fixture.route);
    await waitForPage(page);
    const root = page.locator('.l6c-page');
    assert.equal(await root.getAttribute('data-render-mode'), 'live');
    assert.equal(await root.locator('img[data-figma-reference]').count(), 0);
    assert.equal(await root.locator('.l6c-stack').count(), 1);
    let startState = null;
    if (fixture.route === 'royal-battle-collection-party') {
      const start = root.locator('.l6c-start');
      startState = await start.evaluate(node => {
        const style = getComputedStyle(node);
        const badgeStyle = getComputedStyle(node.querySelector('small'));
        return {
          nativeDisabled: node.disabled,
          ariaDisabled: node.getAttribute('aria-disabled'),
          label: node.getAttribute('aria-label'),
          title: node.querySelector('span')?.textContent.trim(),
          counter: node.querySelector('small')?.textContent.trim(),
          background: style.backgroundColor,
          color: style.color,
          shadow: style.boxShadow,
          badgeBackground: badgeStyle.backgroundColor,
        };
      });
      assert.deepEqual(startState, {
        nativeDisabled: false,
        ariaDisabled: 'true',
        label: 'Игры сборника «Вечеринка» в разработке',
        title: 'Начать игру',
        counter: '10 игр',
        background: 'rgb(254, 57, 31)',
        color: 'rgb(255, 255, 255)',
        shadow: 'rgba(254, 57, 31, 0.91) 0px 3.439px 9.07px 0px',
        badgeBackground: 'rgb(176, 28, 8)',
      });
      assert.equal(await root.getByText('В разработке', { exact: true }).count(), 0);
      assert.equal(await root.getByText('игры скоро', { exact: true }).count(), 0);
      const before = new URL(page.url()).hash;
      await start.evaluate(node => node.click());
      assert.equal(new URL(page.url()).hash, before, 'Visual Figma CTA must not open the birthday-only game');
      await root.screenshot({
        path: path.join(output, 'party-live-390.png'),
        animations: 'disabled',
        caret: 'hide',
        scale: 'device',
      });
    }
    checks.push({
      route: fixture.route,
      balance: fixture.user.balanceCoins,
      entitlements: fixture.user.gameEntitlements,
      startState,
    });
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
  const output = path.join(root, 'qa', 'layout6-collection-exact');
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
    server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5197, strictPort: true } });
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
    await context.route('**/api/**', route => fulfillJson(route, { user: currentUser.value }));

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
      currentUser.value = makeUser();
      const visual = await assertVisualCase({ page, root, output, testCase });
      const interactions = await assertInteractions({ currentUser, page, testCase });
      reports.push({ ...testCase, ...visual, ...interactions });
    }
    const liveFallback = await assertLiveFallback({ currentUser, output, page });
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
      changedPixels: reports.map(item => ({ collection: item.collection, changedPixels: item.changedPixels })),
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
