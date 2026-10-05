const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:5196';
const REFERENCE_WIDTH = 1080;
const VIEWPORTS = Object.freeze([390, 768, 1440, REFERENCE_WIDTH]);
const EXACT_CASES = Object.freeze([
  {
    route: 'karaoke-battle',
    layout: 5,
    frame: 'description',
    height: 6202,
    entitlements: ['karaoke:girls'],
    requiredHotspots: ['back', 'account', 'start', 'category'],
  },
  {
    route: 'karaoke-battle-categories',
    layout: 5,
    frame: 'catalog',
    height: 3695,
    entitlements: ['karaoke:girls'],
    requiredHotspots: ['back', 'account', 'start', 'category'],
  },
  {
    route: 'royal-battle',
    layout: 6,
    frame: 'description',
    height: 7773,
    entitlements: [],
    requiredHotspots: ['back', 'account', 'start', 'category'],
  },
  {
    route: 'royal-battle-collections',
    layout: 6,
    frame: 'catalog',
    height: 3281,
    entitlements: ['royal:all'],
    requiredHotspots: ['back', 'account', 'start', 'category'],
  },
]);
const DYNAMIC_FALLBACK = Object.freeze({
  route: 'karaoke-battle',
  entitlements: [],
});

function makeUser(entitlements) {
  return {
    id: 'layout56-exact-qa',
    name: 'Тимур',
    email: 'qa@example.test',
    balanceCoins: 11240,
    purchasedBlanks: [],
    purchasedCategories: [],
    gameEntitlements: [...entitlements],
  };
}

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

function assertImageMagick(root) {
  const probe = spawnSync('magick', ['-version'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(probe.status, 0, `ImageMagick is required for raw-pixel QA: ${probe.error || probe.stderr}`);
}

function identify(image, root) {
  const result = spawnSync('magick', ['identify', '-format', '%w %h', image], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `Unable to identify ${image}: ${result.error || result.stderr}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  assert.ok(Number.isInteger(width) && Number.isInteger(height), `Unreadable dimensions for ${image}`);
  return { width, height };
}

function compareRawPixels({ actual, diff, reference, root }) {
  const result = spawnSync('magick', [
    'compare',
    '-metric', 'AE',
    '-fuzz', '0%',
    reference,
    actual,
    diff,
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.ok([0, 1].includes(result.status), `ImageMagick compare failed: ${result.error || result.stderr}`);
  const metric = String(result.stderr || result.stdout).trim();
  const changedPixels = Number.parseFloat(metric.match(/[\d.]+/)?.[0]);
  assert.ok(Number.isFinite(changedPixels), `Unreadable ImageMagick AE metric: ${metric}`);
  return { changedPixels, metric };
}

async function waitForImages(page, rootSelector) {
  await page.locator(rootSelector).waitFor({ state: 'visible' });
  await page.evaluate(async (selector) => {
    await document.fonts.ready;
    const images = [...document.querySelectorAll(`${selector} img`)];
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }
      await image.decode();
    }));
  }, rootSelector);
}

async function screenMetrics(page, rootSelector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Missing root: ${selector}`);
    const rootBounds = root.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rootWidth: rootBounds.width,
      rootHeight: root.offsetHeight,
      renderMode: root.getAttribute('data-render-mode'),
      referenceImages: [...root.querySelectorAll('img[data-figma-reference]')].map(image => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: image.getBoundingClientRect().width,
        renderedHeight: image.getBoundingClientRect().height,
      })),
      missingImages: [...root.querySelectorAll('img')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.currentSrc || image.getAttribute('src')),
    };
  }, rootSelector);
}

async function exposeNaturalReferenceCanvas(page) {
  await page.locator('.l56-page').evaluate(element => {
    element.style.setProperty('--canvas-target-width', '1080px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.l56-page');
    return root && Math.abs(root.getBoundingClientRect().width - 1080) < 0.01;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

let navigationId = 0;
async function navigate(page, route) {
  navigationId += 1;
  await page.goto(`${BASE_URL}/?exactQa=${navigationId}#/${route}`, { waitUntil: 'networkidle' });
}

async function assertResponsiveReference({ page, testCase, output, root }) {
  const rootSelector = '.l56-page';
  const viewports = [];
  let pixelComparison;

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, testCase.route);
    await waitForImages(page, rootSelector);
    if (width === REFERENCE_WIDTH) await exposeNaturalReferenceCanvas(page);

    const metrics = await screenMetrics(page, rootSelector);
    assert.equal(metrics.dpr, 1, `${testCase.route} must render at DPR 1`);
    assert.equal(metrics.renderMode, 'figma-reference', `${testCase.route} did not use the exact Figma adapter`);
    assert.deepEqual(metrics.missingImages, [], `Missing images on ${testCase.route} @${width}px`);
    assert.equal(metrics.referenceImages.length, 1, `${testCase.route} must expose exactly one Figma reference raster`);
    assert.equal(metrics.referenceImages[0].complete, true, `Reference image is incomplete on ${testCase.route}`);
    assert.equal(metrics.referenceImages[0].naturalWidth, REFERENCE_WIDTH, `Wrong reference width on ${testCase.route}`);
    assert.equal(metrics.referenceImages[0].naturalHeight, testCase.height, `Wrong reference height on ${testCase.route}`);
    assert.ok(metrics.documentWidth <= width, `Document overflow on ${testCase.route} @${width}: ${metrics.documentWidth}px`);
    assert.ok(metrics.bodyWidth <= width, `Body overflow on ${testCase.route} @${width}: ${metrics.bodyWidth}px`);
    assert.ok(metrics.rootWidth <= width + 0.01, `Root overflow on ${testCase.route} @${width}: ${metrics.rootWidth}px`);

    const screenshot = path.join(output, `${testCase.route}-${width}.png`);
    await page.locator(rootSelector).screenshot({
      path: screenshot,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    });

    if (width === REFERENCE_WIDTH) {
      assert.equal(metrics.rootWidth, REFERENCE_WIDTH, `Wrong 1080 canvas width on ${testCase.route}`);
      assert.equal(metrics.rootHeight, testCase.height, `Wrong exact page height on ${testCase.route}`);
      assert.equal(metrics.referenceImages[0].renderedWidth, REFERENCE_WIDTH, `Reference raster is scaled horizontally on ${testCase.route}`);
      assert.equal(metrics.referenceImages[0].renderedHeight, testCase.height, `Reference raster is scaled vertically on ${testCase.route}`);

      const actualDimensions = identify(screenshot, root);
      assert.deepEqual(actualDimensions, { width: REFERENCE_WIDTH, height: testCase.height }, `Wrong screenshot dimensions on ${testCase.route}`);
      const reference = path.join(root, 'reference', `layout${testCase.layout}`, `${testCase.frame}.png`);
      const referenceDimensions = identify(reference, root);
      assert.deepEqual(referenceDimensions, { width: REFERENCE_WIDTH, height: testCase.height }, `Wrong baseline dimensions on ${testCase.route}`);
      const diff = path.join(output, `${testCase.route}-raw-diff.png`);
      pixelComparison = compareRawPixels({ actual: screenshot, diff, reference, root });
      assert.equal(pixelComparison.changedPixels, 0, `${testCase.route} differs from Figma by ${pixelComparison.changedPixels} raw pixels (fuzz 0)`);
    }

    viewports.push({ width, ...metrics, screenshot: path.relative(root, screenshot) });
  }

  return { viewports, pixelComparison };
}

async function hotspotInventory(page) {
  return page.locator('[data-reference-hotspot]').evaluateAll(nodes => nodes.map((node, index) => ({
    index,
    id: node.getAttribute('data-reference-hotspot'),
    label: node.getAttribute('aria-label') || node.textContent.trim(),
    targetRoute: node.getAttribute('data-target-route'),
    targetState: node.getAttribute('data-target-state'),
    nativeDisabled: node.disabled,
    ariaDisabled: node.getAttribute('aria-disabled') === 'true',
  })));
}

async function clickEveryHotspot({ currentUser, page, testCase }) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  currentUser.value = makeUser(testCase.entitlements);
  await navigate(page, testCase.route);
  await waitForImages(page, '.l56-page');
  await exposeNaturalReferenceCanvas(page);
  const inventory = await hotspotInventory(page);
  assert.ok(inventory.length > 0, `No reference hotspots exposed on ${testCase.route}`);
  const ids = inventory.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, `Hotspot ids must be unique on ${testCase.route}`);
  for (const required of testCase.requiredHotspots) {
    assert.ok(ids.some(id => id.includes(required)), `Missing required ${required} hotspot on ${testCase.route}: ${ids.join(', ')}`);
  }
  assert.ok(ids.filter(id => id.includes('category')).length >= 4,
    `Expected at least four category hotspots on ${testCase.route}: ${ids.join(', ')}`);

  const clicked = [];
  for (const item of inventory) {
    if (item.nativeDisabled) {
      clicked.push({ ...item, result: 'disabled' });
      continue;
    }
    assert.ok(item.id, `Hotspot #${item.index} has no stable id on ${testCase.route}`);
    assert.ok(item.label, `Hotspot ${item.id} has no accessible label on ${testCase.route}`);
    assert.ok(item.targetRoute || item.targetState, `Hotspot ${item.id} declares neither route nor state target`);

    currentUser.value = makeUser(testCase.entitlements);
    await navigate(page, testCase.route);
    await waitForImages(page, '.l56-page');
    await exposeNaturalReferenceCanvas(page);
    const button = page.locator(`[data-reference-hotspot="${item.id}"]`);
    await button.waitFor({ state: 'visible' });

    if (item.ariaDisabled) {
      assert.equal(item.targetState, 'coming-soon', `${testCase.route}/${item.id} has an invalid disabled state`);
      const beforeUrl = page.url();
      const beforeDepth = await page.evaluate(() => Number(window.history.state?.bitvaDepth || 0));
      const beforeDialogs = await page.getByRole('dialog').count();
      await button.evaluate(node => node.click());
      assert.equal(page.url(), beforeUrl, `${testCase.route}/${item.id} must stay on the current card`);
      assert.equal(await page.evaluate(() => Number(window.history.state?.bitvaDepth || 0)), beforeDepth,
        `${testCase.route}/${item.id} changed browser history`);
      assert.equal(await page.getByRole('dialog').count(), beforeDialogs,
        `${testCase.route}/${item.id} opened an obsolete placeholder dialog`);
      clicked.push({ ...item, result: 'coming-soon' });
      continue;
    }

    if (item.targetRoute) {
      const beforeDepth = await page.evaluate(() => Number(window.history.state?.bitvaDepth || 0));
      await button.click();
      const expectedHash = item.targetRoute === 'home' ? '#/' : `#/${item.targetRoute}`;
      await page.waitForURL(url => url.hash === expectedHash);
      const afterDepth = await page.evaluate(() => Number(window.history.state?.bitvaDepth || 0));
      if (item.targetRoute === testCase.route) {
        assert.ok(afterDepth > beforeDepth,
          `Same-route hotspot ${item.id} did not push navigation state on ${testCase.route}`);
      }
      clicked.push({ ...item, result: page.url(), beforeDepth, afterDepth });
      continue;
    }

    const before = {
      pressed: await button.getAttribute('aria-pressed'),
    };
    await button.click();
    if (item.targetState === 'aria-pressed') {
      await page.waitForFunction(({ hotspotId, previous }) => {
        const target = [...document.querySelectorAll('[data-reference-hotspot]')]
          .find(node => node.getAttribute('data-reference-hotspot') === hotspotId);
        return target?.getAttribute('aria-pressed') !== previous;
      }, { hotspotId: item.id, previous: before.pressed });
    } else {
      assert.fail(`Unsupported data-target-state="${item.targetState}" on ${testCase.route}/${item.id}`);
    }
    clicked.push({ ...item, result: item.targetState });
  }
  return clicked;
}

async function assertLiveFallback({ currentUser, page }) {
  currentUser.value = makeUser(DYNAMIC_FALLBACK.entitlements);
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await navigate(page, DYNAMIC_FALLBACK.route);
  const root = page.locator('.l56-page');
  await waitForImages(page, '.l56-page');
  assert.equal(await root.getAttribute('data-render-mode'), 'live', 'Dynamic entitlement state must use live fallback');
  assert.equal(await root.locator('img[data-figma-reference]').count(), 0, 'Live fallback must not masquerade as a Figma reference');
  assert.equal(await root.locator('.l56-paper').count(), 1, 'Expected the live Layout 5 description implementation');
  assert.deepEqual(await root.locator('img').evaluateAll(images => images
    .filter(image => !image.complete || image.naturalWidth === 0)
    .map(image => image.currentSrc || image.getAttribute('src'))), []);
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(widths.document <= widths.viewport, `Live fallback document overflow: ${JSON.stringify(widths)}`);
  assert.ok(widths.body <= widths.viewport, `Live fallback body overflow: ${JSON.stringify(widths)}`);
  return widths;
}

function dedicatedBrowserPids(profile) {
  if (process.platform !== 'win32') return [];
  const escaped = profile.replace(/'/g, "''");
  const command = [
    "$items = Get-CimInstance Win32_Process | Where-Object {",
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
  const output = path.join(root, 'qa', 'layout56-exact');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  assertImageMagick(root);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-layout56-exact-qa-'));
  console.log(`QA_PROFILE=${profile}`);
  const { createServer } = await import('vite');
  const currentUser = { value: makeUser([]) };
  const errors = [];
  const badResponses = [];
  const mediaRequests = [];
  const report = [];
  let server;
  let context;

  try {
    server = await createServer({
      root,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 5196, strictPort: true },
    });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: REFERENCE_WIDTH, height: 900 },
      deviceScaleFactor: 1,
      args: [
        '--mute-audio',
        '--no-first-run',
        '--disable-background-networking',
        '--autoplay-policy=user-gesture-required',
        '--force-color-profile=srgb',
      ],
    });
    await context.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() {
          this.pause();
          return Promise.resolve();
        },
      });
    });
    await context.route('**/api/**', route => json(route, { user: currentUser.value }));

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a)$/i.test(pathname)) mediaRequests.push(request.url());
    });

    for (const testCase of EXACT_CASES) {
      currentUser.value = makeUser(testCase.entitlements);
      const visual = await assertResponsiveReference({ page, testCase, output, root });
      const hotspots = await clickEveryHotspot({ currentUser, page, testCase });
      report.push({
        route: testCase.route,
        layout: testCase.layout,
        fixture: currentUser.value,
        expectedHeight: testCase.height,
        rawPixelDiff: visual.pixelComparison,
        viewports: visual.viewports,
        hotspots,
      });
    }

    const liveFallback = await assertLiveFallback({ currentUser, page });
    assert.deepEqual(errors, [], `Browser page errors: ${errors.join('\n')}`);
    assert.deepEqual(badResponses, [], `Bad HTTP responses: ${badResponses.join('\n')}`);
    assert.deepEqual(mediaRequests, [], `Unexpected media requests: ${mediaRequests.join('\n')}`);
    await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify({
      checkedAt: new Date().toISOString(),
      renderer: 'figma-reference',
      exactWidth: REFERENCE_WIDTH,
      deviceScaleFactor: 1,
      pixelMetric: 'ImageMagick AE, fuzz 0%',
      errors,
      badResponses,
      mediaRequests,
      liveFallback,
      pages: report,
    }, null, 2)}\n`);
    console.log(JSON.stringify({
      status: 'PASS',
      exactRoutes: report.length,
      responsiveScreenshots: report.reduce((sum, pageReport) => sum + pageReport.viewports.length, 0),
      rawChangedPixels: report.map(pageReport => ({ route: pageReport.route, changedPixels: pageReport.rawPixelDiff.changedPixels })),
      heights: report.map(pageReport => ({ route: pageReport.route, height: pageReport.expectedHeight })),
      hotspotsClicked: report.reduce((sum, pageReport) => sum + pageReport.hotspots.filter(item => item.result !== 'disabled').length, 0),
      dynamicFallback: true,
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
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('bitva-layout56-exact-qa-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
