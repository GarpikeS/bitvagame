const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:5198';
const REFERENCE_WIDTH = 1080;
const RESPONSIVE_WIDTHS = Object.freeze([390, 768]);
const SCREENS = Object.freeze([
  {
    route: 'royal-battle-game', node: '1:1061', height: 4604, slug: 'game', reference: 'game-birthday.png',
    requiredHotspots: ['header-back', 'header-account', 'game-previous', 'game-next', 'manage-collections', 'manage-tasks', 'manage-winner', 'manage-new', 'footer-home', 'footer-privacy'],
    comingSoon: ['manage-winner'],
  },
  {
    route: 'royal-battle-tasks', node: '1:1111', height: 4212, slug: 'tasks', reference: 'task-list.png',
    requiredHotspots: ['header-back', 'header-account', 'task-one', 'task-two', 'task-three', 'footer-home', 'footer-privacy'],
    comingSoon: ['task-two', 'task-three'],
  },
  {
    route: 'royal-battle-props', node: '1:1121', height: 2074, slug: 'props', reference: 'props-modal.png',
    requiredHotspots: ['header-back', 'header-account', 'modal-close', 'props-cups', 'props-balls', 'props-all', 'footer-home', 'footer-privacy'],
    comingSoon: [],
  },
  {
    route: 'royal-battle-info-birthday', node: '1:1288', height: 2074, slug: 'info', reference: 'info-modal.png',
    requiredHotspots: ['header-back', 'header-account', 'modal-close', 'footer-home', 'footer-privacy'],
    comingSoon: [],
  },
]);

function makeUser({ balance = 11240, name = 'Тимур' } = {}) {
  return {
    id: 'layout6-screens-qa', name, email: 'qa@example.test', balanceCoins: balance,
    purchasedBlanks: [], purchasedCategories: [], gameEntitlements: ['royal:birthday'],
  };
}

function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

function assertImageMagick(root) {
  const probe = spawnSync('magick', ['-version'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, `ImageMagick is required for exact visual QA: ${probe.error || probe.stderr}`);
}

function identify(imagePath, root) {
  const result = spawnSync('magick', ['identify', '-format', '%w %h', imagePath], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, `Unable to identify ${imagePath}: ${result.error || result.stderr}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  return { width, height };
}

function compareRawPixels({ actual, diff, reference, root }) {
  const result = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '0%', reference, actual, diff], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  assert.ok([0, 1].includes(result.status), `ImageMagick compare failed: ${result.error || result.stderr}`);
  const metric = String(result.stderr || result.stdout).trim();
  const changedPixels = Number.parseFloat(metric.match(/[\d.]+/)?.[0]);
  assert.ok(Number.isFinite(changedPixels), `Unreadable ImageMagick AE metric: ${metric}`);
  return { changedPixels, metric };
}

let navigationId = 0;
async function navigate(page, route) {
  navigationId += 1;
  await page.goto(`${BASE_URL}/?layout6ScreensQa=${navigationId}#/${route}`, { waitUntil: 'domcontentloaded' });
}

async function waitForScreen(page) {
  await page.locator('.l6s-page').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.querySelectorAll('.l6s-page img')];
    await Promise.all(images.map(async image => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }
      await image.decode();
    }));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function forceNaturalCanvas(page) {
  await page.locator('.l6s-page').evaluate(root => {
    root.style.setProperty('--canvas-target-width', '1080px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.l6s-page');
    const stage = document.querySelector('.responsive-canvas');
    return root && stage?.dataset.scaled === 'false' && Math.abs(root.getBoundingClientRect().width - 1080) < 0.01;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function metrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.l6s-page');
    const stage = document.querySelector('.responsive-canvas');
    if (!root || !stage) throw new Error('Layout 6 screen or responsive canvas is missing');
    const bounds = root.getBoundingClientRect();
    const referenceImages = [...root.querySelectorAll('img[data-figma-reference]')].map(image => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: image.getBoundingClientRect().width,
      renderedHeight: image.getBoundingClientRect().height,
    }));
    const hotspots = [...root.querySelectorAll('[data-reference-hotspot]')].map(node => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        id: node.getAttribute('data-reference-hotspot'),
        label: node.getAttribute('aria-label'),
        targetRoute: node.getAttribute('data-target-route'),
        targetState: node.getAttribute('data-target-state'),
        ariaDisabled: node.getAttribute('aria-disabled') === 'true',
        x: box.left - bounds.left,
        y: box.top - bounds.top,
        width: box.width,
        height: box.height,
        backgroundColor: style.backgroundColor,
      };
    });
    return {
      dpr: devicePixelRatio,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      naturalWidth: root.offsetWidth,
      naturalHeight: root.offsetHeight,
      renderedWidth: bounds.width,
      renderedHeight: bounds.height,
      stageHeight: stage.getBoundingClientRect().height,
      node: root.dataset.figmaNode,
      renderMode: root.dataset.renderMode,
      dynamicHeaders: root.querySelectorAll('.l6s-nav').length,
      missingImages: [...root.querySelectorAll('img')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.currentSrc || image.getAttribute('src')),
      audioElements: root.querySelectorAll('audio, video').length,
      referenceImages,
      hotspots,
    };
  });
}

function assertHotspots(report, screen) {
  const ids = report.hotspots.map(hotspot => hotspot.id);
  assert.equal(new Set(ids).size, ids.length, `${screen.route} hotspot ids must be unique`);
  assert.deepEqual(ids.sort(), [...screen.requiredHotspots].sort(), `${screen.route} hotspot inventory is incomplete`);
  assert.deepEqual(report.hotspots.filter(item => item.ariaDisabled).map(item => item.id), screen.comingSoon, `${screen.route} coming-soon controls changed`);
  for (const hotspot of report.hotspots) {
    assert.ok(hotspot.label, `${screen.route}/${hotspot.id} has no accessible label`);
    assert.ok(hotspot.targetRoute || hotspot.targetState, `${screen.route}/${hotspot.id} has no declared outcome`);
    assert.ok(hotspot.width > 0 && hotspot.height > 0, `${screen.route}/${hotspot.id} has an empty hit area`);
    assert.ok(hotspot.x >= -0.01 && hotspot.y >= -0.01, `${screen.route}/${hotspot.id} starts outside the frame`);
    assert.ok(hotspot.x + hotspot.width <= REFERENCE_WIDTH + 0.01, `${screen.route}/${hotspot.id} exceeds the frame width`);
    assert.ok(hotspot.y + hotspot.height <= screen.height + 0.01, `${screen.route}/${hotspot.id} exceeds the frame height`);
    assert.equal(hotspot.backgroundColor, 'rgba(0, 0, 0, 0)', `${screen.route}/${hotspot.id} must remain visually transparent`);
  }
}

async function assertResponsive(page, screen) {
  const results = [];
  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, screen.route);
    await waitForScreen(page);
    const report = await metrics(page);
    const expectedWidth = Math.min(width, 540);
    const expectedScale = expectedWidth / REFERENCE_WIDTH;
    assert.equal(report.dpr, 1, `${screen.route} @${width}px must use DPR 1`);
    assert.equal(report.renderMode, 'figma-reference', `${screen.route} @${width}px left the canonical adapter`);
    assert.ok(Math.abs(report.renderedWidth - expectedWidth) < 0.01, `${screen.route} @${width}px rendered at ${report.renderedWidth}px`);
    assert.ok(Math.abs(report.renderedHeight - screen.height * expectedScale) < 0.02, `${screen.route} @${width}px has the wrong scaled height`);
    assert.ok(Math.abs(report.stageHeight - Math.ceil(screen.height * expectedScale)) <= 1, `${screen.route} @${width}px stage height mismatch`);
    assert.ok(report.documentWidth <= width, `${screen.route} @${width}px document overflow: ${report.documentWidth}px`);
    assert.ok(report.bodyWidth <= width, `${screen.route} @${width}px body overflow: ${report.bodyWidth}px`);
    assert.deepEqual(report.missingImages, [], `${screen.route} @${width}px has missing images`);
    results.push({ width, ...report });
  }
  return results;
}

async function assertExactScreen({ output, page, root, screen }) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, screen.route);
  await waitForScreen(page);
  await forceNaturalCanvas(page);
  const report = await metrics(page);
  assert.equal(report.dpr, 1);
  assert.equal(report.naturalWidth, REFERENCE_WIDTH);
  assert.equal(report.naturalHeight, screen.height);
  assert.equal(report.renderedWidth, REFERENCE_WIDTH);
  assert.equal(report.renderedHeight, screen.height);
  assert.equal(report.node, screen.node);
  assert.equal(report.renderMode, 'figma-reference');
  assert.equal(report.dynamicHeaders, 0, `${screen.route} duplicates the header baked into the Figma raster`);
  assert.deepEqual(report.missingImages, []);
  assert.equal(report.audioElements, 0);
  assert.equal(report.referenceImages.length, 1);
  assert.deepEqual(report.referenceImages[0], {
    complete: true, naturalWidth: REFERENCE_WIDTH, naturalHeight: screen.height,
    renderedWidth: REFERENCE_WIDTH, renderedHeight: screen.height,
  });
  assertHotspots(report, screen);

  const actual = path.join(output, `${screen.slug}.png`);
  await page.locator('.l6s-page').screenshot({ path: actual, animations: 'disabled', caret: 'hide', scale: 'device' });
  assert.deepEqual(identify(actual, root), { width: REFERENCE_WIDTH, height: screen.height });
  const reference = path.join(root, 'public', 'generated', 'layout6-screens', screen.reference);
  assert.deepEqual(identify(reference, root), { width: REFERENCE_WIDTH, height: screen.height });
  const diff = path.join(output, `${screen.slug}-raw-diff.png`);
  const pixelDiff = compareRawPixels({ actual, diff, reference, root });
  assert.equal(pixelDiff.changedPixels, 0, `${screen.route} differs from Figma by ${pixelDiff.changedPixels} raw pixels`);
  return { ...report, pixelDiff, screenshot: path.relative(root, actual) };
}

async function expectRoute(page, from, hotspot, to) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, from);
  await waitForScreen(page);
  await forceNaturalCanvas(page);
  await page.locator(`[data-reference-hotspot="${hotspot}"]`).click();
  const expectedHash = to === 'home' ? '#/' : `#/${to}`;
  await page.waitForURL(url => url.hash === expectedHash);
}

async function expectComingSoon(page, route, hotspot) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, route);
  await waitForScreen(page);
  await forceNaturalCanvas(page);
  const button = page.locator(`[data-reference-hotspot="${hotspot}"]`);
  assert.equal(await button.getAttribute('aria-disabled'), 'true');
  const before = new URL(page.url()).hash;
  await button.evaluate(node => node.click());
  assert.equal(new URL(page.url()).hash, before, `${route}/${hotspot} must remain on the current screen`);
  assert.equal(await page.locator('.l6s-page--unavailable').count(), 0, 'Obsolete standalone placeholder must not render');
}

function dedicatedBrowserPids(profile) {
  if (process.platform !== 'win32') return [];
  const escaped = profile.replace(/'/g, "''");
  const command = [
    '$items = Get-CimInstance Win32_Process | Where-Object {',
    "  $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -like '*${escaped}*'",
    '};',
    '$items | ForEach-Object { $_.ProcessId }',
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

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa', 'layout6-screens');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  assertImageMagick(root);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-layout6-screens-qa-'));
  const { createServer } = await import('vite');
  const currentUser = { value: makeUser() };
  const errors = [];
  const badResponses = [];
  const consoleErrors = [];
  const mediaRequests = [];
  const reports = [];
  let server;
  let context;

  try {
    server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5198, strictPort: true } });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: REFERENCE_WIDTH, height: 900 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--force-color-profile=srgb'],
    });
    await context.addInitScript(() => {
      window.__layout6MediaPlayAttempts = 0;
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() {
          window.__layout6MediaPlayAttempts += 1;
          this.pause();
          return Promise.resolve();
        },
      });
      localStorage.setItem('bitva_music_category', 'Девичник');
      localStorage.setItem('bitva_music_song_index', '37');
      localStorage.setItem('bitva:layout5:karaoke-category', '90s');
    });
    await context.route('**/api/**', route => json(route, { user: currentUser.value }));

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a|mp4|webm)$/i.test(pathname)) mediaRequests.push(request.url());
    });

    for (const screen of SCREENS) {
      currentUser.value = makeUser();
      const responsive = await assertResponsive(page, screen);
      const exact = await assertExactScreen({ output, page, root, screen });
      reports.push({ route: screen.route, node: screen.node, expectedHeight: screen.height, responsive, exact });
    }

    currentUser.value = makeUser();
    await expectRoute(page, 'royal-battle-tasks', 'task-one', 'royal-battle-game');
    await expectRoute(page, 'royal-battle-game', 'manage-tasks', 'royal-battle-tasks');
    await expectRoute(page, 'royal-battle-props', 'modal-close', 'royal-battle-collection-birthday');
    await expectRoute(page, 'royal-battle-info-birthday', 'modal-close', 'royal-battle-collection-birthday');
    await expectRoute(page, 'royal-battle-game', 'header-account', 'profile');
    await expectRoute(page, 'royal-battle-info-birthday', 'footer-home', 'home');
    await expectComingSoon(page, 'royal-battle-game', 'manage-winner');
    await expectComingSoon(page, 'royal-battle-tasks', 'task-two');
    await expectComingSoon(page, 'royal-battle-tasks', 'task-three');

    currentUser.value = makeUser({ balance: 777, name: 'Алексей' });
    await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
    await navigate(page, 'royal-battle-info-birthday');
    await waitForScreen(page);
    await forceNaturalCanvas(page);
    const fallback = await metrics(page);
    assert.equal(fallback.renderMode, 'live', 'Noncanonical identity must use the dynamic fallback');
    assert.equal(fallback.dynamicHeaders, 1, 'Noncanonical identity must render one dynamic header');
    assert.deepEqual(fallback.missingImages, []);

    const storage = await page.evaluate(() => ({
      mediaPlayAttempts: window.__layout6MediaPlayAttempts,
      musicCategory: localStorage.getItem('bitva_music_category'),
      musicIndex: localStorage.getItem('bitva_music_song_index'),
      karaokeCategory: localStorage.getItem('bitva:layout5:karaoke-category'),
    }));
    assert.deepEqual(storage, {
      mediaPlayAttempts: 0,
      musicCategory: 'Девичник',
      musicIndex: '37',
      karaokeCategory: '90s',
    });
    assert.deepEqual(errors, [], `Page errors: ${errors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `Console errors: ${consoleErrors.join('\n')}`);
    assert.deepEqual(badResponses, [], `Bad responses: ${badResponses.join('\n')}`);
    assert.deepEqual(mediaRequests, [], `Unexpected media requests: ${mediaRequests.join('\n')}`);

    await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify({
      checkedAt: new Date().toISOString(), renderer: 'figma-reference', exactWidth: REFERENCE_WIDTH,
      deviceScaleFactor: 1, pixelMetric: 'ImageMagick AE, fuzz 0%', errors, consoleErrors,
      badResponses, mediaRequests, storage, dynamicFallback: fallback, screens: reports,
    }, null, 2)}\n`);
    console.log(JSON.stringify({
      status: 'PASS', exactScreens: reports.length,
      responsiveChecks: reports.reduce((sum, item) => sum + item.responsive.length, 0),
      rawChangedPixels: reports.map(item => ({ route: item.route, changedPixels: item.exact.pixelDiff.changedPixels })),
      hotspots: reports.map(item => ({ route: item.route, count: item.exact.hotspots.length })),
      dynamicFallback: true, mediaPlayAttempts: storage.mediaPlayAttempts,
      mediaRequests: mediaRequests.length, errors: errors.length + consoleErrors.length + badResponses.length,
    }));
  } finally {
    await context?.close();
    await server?.close();
    const remainingPids = await waitForDedicatedBrowserExit(profile);
    if (remainingPids.length) {
      console.error(`Dedicated browser process cleanup failed: ${remainingPids.join(', ')}`);
      process.exitCode = 1;
    }
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('bitva-layout6-screens-qa-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
