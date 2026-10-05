const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const HOST = '127.0.0.1';
const PORT = 5198;
const BASE_URL = `http://${HOST}:${PORT}`;
const REFERENCE_WIDTH = 1080;
const TARGET_WIDTH = 540;
const VIEWPORTS = Object.freeze([390, 768, 1080, 1440]);
const PROFILE_PREFIX = 'bitva-layout5-purchase-qa-';
const PAPER = '#f3f3f3';
const ALPHA_THRESHOLD = '0.4%'; // One 8-bit channel step is 0.392157%.

const SCREENS = Object.freeze({
  confirm: {
    route: 'karaoke-battle-purchase-confirm',
    height: 2186,
    node: '1:754',
    asset: 'confirm-screen.png',
    balance: 11240,
    title: null,
    dynamic: true,
    checkoutRect: [60, 350, 960, 1169],
    hotspots: [
      { id: 'confirm-close', selector: '.l5p-checkout-close', callback: 'back' },
      { id: 'confirm-pay', selector: '.l5p-checkout-pay', callback: 'confirm' },
    ],
  },
  insufficient: {
    route: 'karaoke-battle-purchase-insufficient',
    height: 2680,
    node: '1:1544',
    asset: 'insufficient-screen.png',
    balance: 0,
    title: 'Оплата',
    dynamic: true,
    hotspots: [
      { id: 'insufficient-pay', selector: '.l5p-checkout-pay', callback: 'topup' },
      { id: 'insufficient-privacy', selector: '.l5p-privacy', rect: [530, 2460, 470, 56], hash: '#/privacy' },
    ],
  },
  success: {
    route: 'karaoke-battle-purchase-success',
    height: 2564,
    node: '1:2649',
    asset: 'success-screen.png',
    balance: 11240,
    title: 'Успешная оплата',
    hotspots: [
      { id: 'success-start', selector: '.l5p-success-start', rect: [107.5, 844.431, 864, 122], callback: 'start' },
      { id: 'success-return', selector: '.l5p-success-return', rect: [107.5, 990.431, 864, 120], callback: 'return' },
      { id: 'success-privacy', selector: '.l5p-privacy', rect: [530, 2340, 470, 56], hash: '#/privacy' },
    ],
  },
  girls: {
    route: 'karaoke-battle-girls-cover',
    height: 3899,
    node: '1:2133',
    asset: 'girls-screen.png',
    balance: 11240,
    title: 'Караоке-битва',
    dynamicRegions: [[90, 2049, 176, 2126]],
    hotspots: [
      { id: 'girls-category', selector: '.l5p-girls-category', rect: [60, 310.431, 960, 128], callback: 'category' },
      { id: 'girls-buy', selector: '.l5p-girls-buy', rect: [505.703, 1277.431, 468.589, 156], callback: 'girls-buy' },
      { id: 'girls-start-disabled', selector: '.l5p-girls-start', rect: [60, 1498.431, 960, 136], disabled: true },
      { id: 'girls-category-row', selector: '.l5p-girls-row--category', rect: [60, 1871.431, 960, 144], callback: 'category' },
      { id: 'girls-songs', selector: '.l5p-girls-row--songs', rect: [60, 2015.431, 960, 144], callback: 'songs' },
      { id: 'girls-winner', selector: '.l5p-girls-row--winner', rect: [60, 2159.431, 960, 144], callback: 'winner' },
      { id: 'girls-new-game', selector: '.l5p-girls-row--new', rect: [60, 2303.431, 960, 144], callback: 'new-game' },
      { id: 'girls-privacy', selector: '.l5p-privacy', rect: [530, 3675, 470, 56], hash: '#/privacy' },
    ],
  },
});

function makeUser({ balance = 11240, entitlements = [], name = 'Тимур' } = {}) {
  return {
    id: 'layout5-purchase-exact-qa',
    name,
    email: 'qa@example.test',
    balanceCoins: balance,
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

function runMagick(args, root, label, accepted = [0]) {
  const result = spawnSync('magick', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.ok(accepted.includes(result.status), `${label}: ${result.error || result.stderr || result.stdout}`);
  return result;
}

function assertImageMagick(root) {
  runMagick(['-version'], root, 'ImageMagick is required');
}

function identify(image, root) {
  const result = runMagick(['identify', '-format', '%w %h', image], root, `Unable to identify ${image}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  assert.ok(Number.isInteger(width) && Number.isInteger(height), `Unreadable dimensions for ${image}`);
  return { width, height };
}

function alphaRange8(image, root) {
  const result = runMagick(
    ['identify', '-format', '%[fx:minima.a] %[fx:maxima.a]', image],
    root,
    `Unable to inspect alpha for ${image}`,
  );
  const [min, max] = result.stdout.trim().split(/\s+/).map(value => Math.round(Number(value) * 255));
  assert.ok(Number.isFinite(min) && Number.isFinite(max));
  return { min, max };
}

function comparePixels({ actual, diff, fuzz = '0%', reference, root }) {
  const result = runMagick(
    ['compare', '-metric', 'AE', '-fuzz', fuzz, reference, actual, diff],
    root,
    `Image comparison failed for ${actual}`,
    [0, 1],
  );
  const metric = String(result.stderr || result.stdout).trim();
  const changedPixels = Number.parseFloat(metric);
  assert.ok(Number.isFinite(changedPixels), `Unreadable ImageMagick AE metric: ${metric}`);
  return { changedPixels, fuzz, metric };
}

function maskRegions({ input, output, regions, root }) {
  const draws = regions.flatMap(([x1, y1, x2, y2]) => ['-draw', `rectangle ${x1},${y1} ${x2},${y2}`]);
  runMagick([input, '-fill', '#000000', ...draws, output], root, `Unable to mask dynamic regions in ${input}`);
}

function normalizeBrowserAlpha(source, output, root) {
  // Chromium/Skia stores 8-bit premultiplied channels. Reproduce that blend
  // against the page's #f3f3f3 before comparing with its opaque screenshot.
  const expression = '(floor(u*255*u.a+0.5)+floor(243*(1-u.a)+0.5))/255';
  runMagick(
    [source, '-channel', 'RGB', '-fx', expression, '+channel', '-alpha', 'off', output],
    root,
    `Unable to normalize alpha for ${source}`,
  );
  return { background: PAPER, expression, model: '8-bit premultiplied Chromium/Skia composite' };
}

function closeTo(actual, expected, label, tolerance = 0.1) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ±${tolerance}, received ${actual}`);
}

function assertRect(actual, expected, label, tolerance = 0.1) {
  const [x, y, width, height] = expected;
  closeTo(actual.x, x, `${label}.x`, tolerance);
  closeTo(actual.y, y, `${label}.y`, tolerance);
  closeTo(actual.width, width, `${label}.width`, tolerance);
  closeTo(actual.height, height, `${label}.height`, tolerance);
}

async function waitForImages(page, selector) {
  await page.locator(selector).waitFor({ state: 'visible' });
  await page.evaluate(async (rootSelector) => {
    await document.fonts.ready;
    const images = [...document.querySelectorAll(`${rootSelector} img`)];
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }
      await image.decode();
    }));
  }, selector);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function harnessMetrics(page) {
  return page.locator('.l5p-page').evaluate((rootNode) => {
    const root = rootNode.getBoundingClientRect();
    const image = rootNode.querySelector('.l5p-screen');
    const imageBounds = image.getBoundingClientRect();
    const checkout = rootNode.querySelector('.l5p-checkout');
    const checkoutBounds = checkout?.getBoundingClientRect();
    return {
      dpr: devicePixelRatio,
      layout: rootNode.dataset.layout,
      node: rootNode.dataset.figmaNode,
      className: rootNode.className,
      offsetWidth: rootNode.offsetWidth,
      offsetHeight: rootNode.offsetHeight,
      root: { x: root.x, y: root.y, width: root.width, height: root.height },
      image: {
        src: image.currentSrc,
        pathname: new URL(image.currentSrc, location.href).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        x: imageBounds.left - root.left,
        y: imageBounds.top - root.top,
        width: imageBounds.width,
        height: imageBounds.height,
      },
      hitCount: rootNode.querySelectorAll('.l5p-hit').length,
      checkoutCount: rootNode.querySelectorAll('.l5p-checkout').length,
      checkout: checkoutBounds ? {
        x: checkoutBounds.left - root.left,
        y: checkoutBounds.top - root.top,
        width: checkoutBounds.width,
        height: checkoutBounds.height,
      } : null,
      missingImages: [...rootNode.querySelectorAll('img')]
        .filter(item => !item.complete || item.naturalWidth === 0)
        .map(item => item.currentSrc || item.getAttribute('src')),
      audioElements: document.querySelectorAll('audio').length,
      videoElements: document.querySelectorAll('video').length,
      mediaPlayCalls: Number(window.__layout5PurchaseQaMediaPlayCalls || 0),
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });
}

async function hotspotMetrics(page, expected) {
  const root = page.locator('.l5p-page');
  const rootBounds = await root.boundingBox();
  const results = [];
  for (const hotspot of expected.hotspots) {
    const locator = page.locator(hotspot.selector);
    assert.equal(await locator.count(), 1, `${hotspot.id} must exist exactly once`);
    const bounds = await locator.boundingBox();
    assert.ok(bounds, `${hotspot.id} has no box`);
    const result = {
      ...hotspot,
      label: await locator.getAttribute('aria-label'),
      actualDisabled: await locator.isDisabled(),
      x: bounds.x - rootBounds.x,
      y: bounds.y - rootBounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    assert.ok(result.label, `${hotspot.id} has no accessible label`);
    assert.equal(result.actualDisabled, Boolean(hotspot.disabled), `${hotspot.id} disabled state differs`);
    if (hotspot.rect) assertRect(result, hotspot.rect, hotspot.id);
    results.push(result);
  }
  return results;
}

let harnessNavigationId = 0;
async function openHarness(page, state) {
  harnessNavigationId += 1;
  await page.goto(`${BASE_URL}/qa/layout5-purchase-harness.html?state=${state}&qa=${harnessNavigationId}`, { waitUntil: 'networkidle' });
  await waitForImages(page, `.l5p-page--${state}`);
}

async function captureExactHarness({ output, page, root, scratch, state, expected }) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await openHarness(page, state);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  const metrics = await harnessMetrics(page);
  assert.equal(metrics.dpr, 1);
  assert.equal(metrics.layout, '5');
  assert.equal(metrics.node, expected.node);
  assert.ok(metrics.className.includes(`l5p-page--${state}`));
  assert.equal(metrics.offsetWidth, REFERENCE_WIDTH);
  assert.equal(metrics.offsetHeight, expected.height);
  assertRect(metrics.root, [0, 0, REFERENCE_WIDTH, expected.height], `${state}.root`, 0.01);
  assert.ok(metrics.image.pathname.endsWith(`/generated/layout5-purchase/${expected.asset}`));
  assert.equal(metrics.image.complete, true);
  assert.equal(metrics.image.naturalWidth, REFERENCE_WIDTH);
  assert.equal(metrics.image.naturalHeight, expected.height);
  assertRect(metrics.image, [0, 0, REFERENCE_WIDTH, expected.height], `${state}.image`, 0.01);
  if (expected.dynamic) {
    assert.equal(metrics.checkoutCount, 1);
    if (expected.checkoutRect) assertRect(metrics.checkout, expected.checkoutRect, `${state}.checkout`, 0.02);
  }
  else assert.equal(metrics.hitCount, expected.hotspots.length);
  assert.deepEqual(metrics.missingImages, []);
  assert.equal(metrics.audioElements, 0);
  assert.equal(metrics.videoElements, 0);
  assert.equal(metrics.mediaPlayCalls, 0);
  assert.ok(metrics.documentWidth <= REFERENCE_WIDTH);
  assert.ok(metrics.bodyWidth <= REFERENCE_WIDTH);
  const hotspots = await hotspotMetrics(page, expected);

  const screenshot = path.join(output, `${state}-1080.png`);
  await page.locator('.l5p-page').screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
  assert.deepEqual(identify(screenshot, root), { width: REFERENCE_WIDTH, height: expected.height });
  const reference = path.join(root, 'public', 'generated', 'layout5-purchase', expected.asset);
  assert.deepEqual(identify(reference, root), { width: REFERENCE_WIDTH, height: expected.height });
  let alpha = null;
  let raw = null;
  let alphaAware = null;
  if (!expected.dynamic) {
    alpha = alphaRange8(reference, root);
    let actualForComparison = screenshot;
    let referenceForComparison = reference;
    if (expected.dynamicRegions?.length) {
      actualForComparison = path.join(scratch, `${state}-actual-masked.png`);
      referenceForComparison = path.join(scratch, `${state}-reference-masked.png`);
      maskRegions({ input: screenshot, output: actualForComparison, regions: expected.dynamicRegions, root });
      maskRegions({ input: reference, output: referenceForComparison, regions: expected.dynamicRegions, root });
    }
    raw = comparePixels({
      actual: actualForComparison,
      reference: referenceForComparison,
      diff: path.join(output, `${state}-raw-diff.png`),
      root,
    });
  }
  if (!expected.dynamic && state === 'confirm') {
    assert.deepEqual(alpha, { min: 254, max: 255 }, 'Confirm must retain the known Figma alpha=254 export');
    assert.ok(raw.changedPixels > 0, 'Raw confirm AE must not be reported as zero: source contains alpha=254');
    const normalized = path.join(scratch, 'confirm-browser-alpha-normalized.png');
    const normalization = normalizeBrowserAlpha(reference, normalized, root);
    const exact = comparePixels({
      actual: screenshot,
      reference: normalized,
      diff: path.join(output, 'confirm-alpha-aware-exact-diff.png'),
      root,
    });
    const threshold = comparePixels({
      actual: screenshot,
      reference: normalized,
      diff: path.join(output, 'confirm-alpha-aware-threshold-diff.png'),
      fuzz: ALPHA_THRESHOLD,
      root,
    });
    assert.equal(exact.changedPixels, 0, `Alpha-normalized confirm differs by ${exact.changedPixels} exact pixels`);
    assert.equal(threshold.changedPixels, 0, `Alpha-normalized confirm exceeds one 8-bit channel step`);
    alphaAware = { normalization, exact, threshold };
  } else if (!expected.dynamic) {
    assert.deepEqual(alpha, { min: 255, max: 255 }, `${state} should be fully opaque`);
    assert.equal(raw.changedPixels, 0, `${state} differs from its direct Figma PNG by ${raw.changedPixels} pixels`);
  }

  return {
    state,
    node: expected.node,
    screenshot: path.relative(root, screenshot),
    alpha,
    rawPixelComparison: raw,
    alphaAware,
    metrics,
    hotspots,
  };
}

async function exerciseHarnessHotspots(page) {
  const results = [];
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  for (const [state, expected] of Object.entries(SCREENS)) {
    for (const hotspot of expected.hotspots) {
      await openHarness(page, state);
      const locator = page.locator(hotspot.selector);
      assert.equal(await locator.count(), 1);
      if (hotspot.disabled) {
        assert.equal(await locator.isDisabled(), true);
        await locator.evaluate(node => node.click());
        await page.waitForTimeout(50);
        const result = await page.evaluate(() => ({ action: document.documentElement.dataset.lastAction || null, hash: location.hash }));
        assert.deepEqual(result, { action: null, hash: '' }, `${hotspot.id} must remain inert`);
        results.push({ state, id: hotspot.id, result: 'disabled-and-inert' });
      } else if (hotspot.callback) {
        await locator.click();
        await page.waitForFunction(action => document.documentElement.dataset.lastAction === action, hotspot.callback);
        results.push({ state, id: hotspot.id, result: `callback:${hotspot.callback}` });
      } else {
        await locator.click();
        await page.waitForFunction(hash => location.hash === hash, hotspot.hash);
        results.push({ state, id: hotspot.id, result: `navigate:${hotspot.hash}` });
      }
      const media = await page.evaluate(() => ({
        audio: document.querySelectorAll('audio').length,
        playCalls: Number(window.__layout5PurchaseQaMediaPlayCalls || 0),
      }));
      assert.deepEqual(media, { audio: 0, playCalls: 0 }, `${hotspot.id} caused media activity`);
    }
  }
  assert.equal(results.length, Object.values(SCREENS).reduce((sum, screen) => sum + screen.hotspots.length, 0));
  return results;
}

let appNavigationId = 0;
async function openApp(page, currentUser, state, userOverride, renderedState = state) {
  const expected = SCREENS[state];
  currentUser.value = makeUser({ balance: expected.balance, ...userOverride });
  appNavigationId += 1;
  const query = new URLSearchParams({
    layout5PurchaseAppQa: String(appNavigationId),
    qaName: currentUser.value.name,
    qaBalance: String(currentUser.value.balanceCoins),
  });
  await page.goto(`${BASE_URL}/?${query}#/${expected.route}`, { waitUntil: 'networkidle' });
  await waitForImages(page, `.l5p-page--${renderedState}`);
}

async function appMetrics(page) {
  return page.locator('.l5p-page').evaluate((rootNode) => {
    const bounds = rootNode.getBoundingClientRect();
    const image = rootNode.querySelector('.l5p-screen');
    return {
      mode: [...rootNode.classList].find(name => name.startsWith('l5p-page--'))?.replace('l5p-page--', ''),
      layout: rootNode.dataset.layout,
      node: rootNode.dataset.figmaNode,
      dpr: devicePixelRatio,
      viewportWidth: innerWidth,
      offsetWidth: rootNode.offsetWidth,
      offsetHeight: rootNode.offsetHeight,
      rootWidth: bounds.width,
      rootHeight: bounds.height,
      stageScaled: document.querySelector('.responsive-canvas')?.dataset.scaled,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      image: {
        pathname: new URL(image.currentSrc, location.href).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      },
      dynamicNavCount: rootNode.querySelectorAll('.l5p-dynamic-nav').length,
      dynamicTitle: rootNode.querySelector('.l5p-dynamic-nav .detail-nav-back strong')?.textContent.trim() || null,
      dynamicBalance: rootNode.querySelector('.l5p-dynamic-nav .balance-badge strong')?.textContent.trim() || null,
      dynamicAvatar: rootNode.querySelector('.l5p-dynamic-nav .avatar')?.textContent.trim() || null,
      missingImages: [...rootNode.querySelectorAll('img')]
        .filter(item => !item.complete || item.naturalWidth === 0)
        .map(item => item.currentSrc || item.getAttribute('src')),
      audioElements: document.querySelectorAll('audio').length,
      videoElements: document.querySelectorAll('video').length,
      mediaPlayCalls: Number(window.__layout5PurchaseQaMediaPlayCalls || 0),
      routeHash: location.hash,
      musicLotoRoots: document.querySelectorAll('.music-game-page, .music-song-card, [data-game="music-loto"]').length,
    };
  });
}

async function captureResponsiveApp({ currentUser, output, page, root, state, expected, width }) {
  await page.setViewportSize({ width, height: 900 });
  await openApp(page, currentUser, state);
  const metrics = await appMetrics(page);
  const expectedWidth = Math.min(width, TARGET_WIDTH);
  const expectedScale = expectedWidth / REFERENCE_WIDTH;
  assert.equal(metrics.mode, state);
  assert.equal(metrics.layout, '5');
  assert.equal(metrics.node, expected.node);
  assert.equal(metrics.dpr, 1);
  assert.equal(metrics.offsetWidth, REFERENCE_WIDTH);
  assert.equal(metrics.offsetHeight, expected.height);
  closeTo(metrics.rootWidth, expectedWidth, `${state}@${width}.rootWidth`, 0.02);
  closeTo(metrics.rootHeight, expected.height * expectedScale, `${state}@${width}.rootHeight`, 0.15);
  assert.equal(metrics.stageScaled, width < TARGET_WIDTH ? 'true' : 'false');
  assert.ok(metrics.documentWidth <= width, `${state}@${width} document overflow`);
  assert.ok(metrics.bodyWidth <= width, `${state}@${width} body overflow`);
  assert.ok(metrics.image.pathname.endsWith(`/generated/layout5-purchase/${expected.asset}`));
  assert.equal(metrics.image.complete, true);
  assert.equal(metrics.image.naturalWidth, REFERENCE_WIDTH);
  assert.equal(metrics.image.naturalHeight, expected.height);
  assert.deepEqual(metrics.missingImages, []);
  assert.equal(metrics.audioElements, 0);
  assert.equal(metrics.videoElements, 0);
  assert.equal(metrics.mediaPlayCalls, 0);
  assert.equal(metrics.routeHash, `#/${expected.route}`);
  assert.equal(metrics.musicLotoRoots, 0);
  if (state === 'confirm') {
    assert.equal(metrics.dynamicNavCount, 0);
  } else {
    assert.equal(metrics.dynamicNavCount, 1);
    assert.equal(metrics.dynamicTitle, expected.title);
    assert.equal(metrics.dynamicBalance.replace(/\s/g, ''), String(expected.balance));
    assert.equal(metrics.dynamicAvatar, 'Т');
  }
  const screenshot = path.join(output, `${state}-responsive-${width}.png`);
  await page.locator('.l5p-page').screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
  const dimensions = identify(screenshot, root);
  closeTo(dimensions.width, expectedWidth, `${state}@${width}.screenshotWidth`, 1);
  return { width, expectedScale, screenshot: path.relative(root, screenshot), dimensions, metrics };
}

async function waitForHash(page, route) {
  const expected = route === 'home' ? '#/' : `#/${route}`;
  await page.waitForFunction(hash => location.hash === hash, expected);
  return expected;
}

async function assertHealthyDestination(page, route) {
  const hash = await waitForHash(page, route);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const health = await page.evaluate(() => ({
    hash: location.hash,
    audioElements: document.querySelectorAll('audio').length,
    mediaPlayCalls: Number(window.__layout5PurchaseQaMediaPlayCalls || 0),
    brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0)
      .map(image => image.currentSrc || image.getAttribute('src')),
  }));
  assert.equal(health.hash, hash);
  assert.equal(health.audioElements, 0);
  assert.equal(health.mediaPlayCalls, 0);
  assert.deepEqual(health.brokenImages, []);
  return health;
}

async function assertDynamicBehavior({ currentUser, page }) {
  await page.setViewportSize({ width: 1080, height: 900 });
  const checks = [];

  await openApp(page, currentUser, 'girls', { balance: 777, name: 'Алиса' });
  let metrics = await appMetrics(page);
  assert.equal(metrics.dynamicNavCount, 1);
  assert.equal(metrics.dynamicTitle, 'Караоке-битва');
  assert.equal(metrics.dynamicBalance.replace(/\s/g, ''), '777');
  assert.equal(metrics.dynamicAvatar, 'А');
  checks.push({ behavior: 'dynamic-identity', balance: metrics.dynamicBalance, avatar: metrics.dynamicAvatar });

  await page.locator('.l5p-dynamic-nav .nav-account').click();
  checks.push({ behavior: 'dynamic-account', destination: await assertHealthyDestination(page, 'profile') });

  await openApp(page, currentUser, 'girls', { balance: 777, name: 'Алиса' });
  await page.locator('.l5p-dynamic-nav .detail-nav-back').click();
  checks.push({ behavior: 'dynamic-back', destination: await assertHealthyDestination(page, 'karaoke-battle-categories') });

  await openApp(page, currentUser, 'insufficient', { balance: 50 }, 'confirm');
  metrics = await appMetrics(page);
  assert.equal(metrics.mode, 'confirm', 'Balance >=50 must promote insufficient route to confirm state');
  assert.equal(metrics.node, SCREENS.confirm.node);
  assert.equal(metrics.offsetHeight, SCREENS.confirm.height);
  assert.equal(metrics.dynamicNavCount, 0);
  checks.push({ behavior: 'balance-threshold', requested: 'insufficient', rendered: metrics.mode, balance: 50 });

  await openApp(page, currentUser, 'insufficient', { balance: 0 });
  await page.locator('.l5p-checkout-pay').click();
  checks.push({ behavior: 'top-up-integration', destination: await assertHealthyDestination(page, 'balance-top-up') });

  await openApp(page, currentUser, 'success', { balance: 11240, entitlements: ['karaoke:90s'] });
  await page.locator('.l5p-success-start').click();
  checks.push({ behavior: 'start-game-integration', destination: await assertHealthyDestination(page, 'karaoke-battle-game') });
  assert.equal(await page.locator('.l5rg-page').count(), 1, 'Success start must open the separate Layout 5 game');
  assert.equal(await page.locator('.music-game-page').count(), 0, 'Success start must not open Music Lotto');

  return checks;
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
  return new Promise((resolve) => {
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
  const output = path.join(root, 'qa', 'layout5-purchase');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  assertImageMagick(root);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), PROFILE_PREFIX));
  const scratch = path.join(profile, 'imagemagick-scratch');
  await fs.mkdir(scratch, { recursive: true });
  console.log(`QA_PROFILE=${profile}`);

  const { createServer } = await import('vite');
  const currentUser = { value: makeUser() };
  const browserErrors = [];
  const consoleErrors = [];
  const badResponses = [];
  const mediaRequests = [];
  let server;
  let context;
  let runError = null;
  let cleanup = null;
  let report = null;

  try {
    server = await createServer({ root, logLevel: 'error', server: { host: HOST, port: PORT, strictPort: true } });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: REFERENCE_WIDTH, height: 900 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--force-color-profile=srgb'],
    });
    await context.addInitScript(() => {
      window.__layout5PurchaseQaMediaPlayCalls = 0;
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() { window.__layout5PurchaseQaMediaPlayCalls += 1; this.pause(); return Promise.resolve(); },
      });
      const params = new URLSearchParams(location.search);
      if (!params.has('layout5PurchaseAppQa')) return;
      localStorage.clear();
      localStorage.setItem('bitva_logged_in', '1');
      localStorage.setItem('bitva_name', params.get('qaName') || 'Тимур');
      localStorage.setItem('bitva_balance', params.get('qaBalance') || '0');
      localStorage.setItem('bitva_music_category', 'Девичник');
      localStorage.setItem('bitva_music_song_index', '37');
    });
    await context.route('**/api/**', (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/purchases/entitlements') {
        const body = route.request().postDataJSON?.() || {};
        const price = 50;
        currentUser.value = {
          ...currentUser.value,
          balanceCoins: Math.max(0, currentUser.value.balanceCoins - price),
          gameEntitlements: [...new Set([...currentUser.value.gameEntitlements, body.entitlementId])],
        };
        return json(route, { user: currentUser.value, alreadyOwned: false });
      }
      return json(route, { user: currentUser.value });
    });

    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(pathname)) mediaRequests.push(request.url());
    });

    const exactScreens = [];
    for (const [state, expected] of Object.entries(SCREENS)) {
      exactScreens.push(await captureExactHarness({ output, page, root, scratch, state, expected }));
    }
    const hotspotChecks = await exerciseHarnessHotspots(page);
    const responsive = [];
    for (const [state, expected] of Object.entries(SCREENS)) {
      const viewports = [];
      for (const width of VIEWPORTS) {
        viewports.push(await captureResponsiveApp({ currentUser, output, page, root, state, expected, width }));
      }
      responsive.push({ state, viewports });
    }
    const dynamicBehavior = await assertDynamicBehavior({ currentUser, page });

    assert.deepEqual(browserErrors, [], `Browser page errors:\n${browserErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors:\n${consoleErrors.join('\n')}`);
    assert.deepEqual(badResponses, [], `HTTP >=400 responses:\n${badResponses.join('\n')}`);
    assert.deepEqual(mediaRequests, [], `Unexpected media/audio requests:\n${mediaRequests.join('\n')}`);
    report = {
      checkedAt: new Date().toISOString(), renderer: 'Figma PNG visual layer with live category checkout',
      referenceWidth: REFERENCE_WIDTH, deviceScaleFactor: 1,
      rawPixelMetric: 'ImageMagick AE, fuzz 0%', alphaAwareThreshold: ALPHA_THRESHOLD,
      confirmAlphaNote: 'The category checkout is rendered live so its price and category stay truthful; immutable success and girls screens remain direct Figma PNG layers.',
      exactScreens, responsive, hotspotChecks, dynamicBehavior,
      browserErrors, consoleErrors, badResponses, mediaRequests,
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
    try { await fs.rm(profile, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(`profile removal: ${error.message}`); }
    const profileRemoved = !await fileExists(profile);
    if (!profileRemoved) cleanupErrors.push(`profile remains at ${profile}`);
    cleanup = { profile, browserPids: remainingPids, profileRemoved, serverPortReleased: portReleased };
    if (cleanupErrors.length) {
      const cleanupError = new Error(`QA cleanup failed: ${cleanupErrors.join('; ')}`);
      runError = runError ? new AggregateError([runError, cleanupError], 'QA and cleanup failed') : cleanupError;
    }
  }

  if (runError) throw runError;
  report.cleanup = cleanup;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const exactRasterScreens = report.exactScreens.filter(screen => screen.rawPixelComparison);
  console.log(JSON.stringify({
    status: 'PASS', exactScreens: report.exactScreens.length,
    rawAE: exactRasterScreens.map(screen => ({ state: screen.state, changedPixels: screen.rawPixelComparison.changedPixels })),
    liveCheckoutScreens: report.exactScreens.filter(screen => !screen.rawPixelComparison).map(screen => screen.state),
    responsiveScreenshots: report.responsive.reduce((sum, screen) => sum + screen.viewports.length, 0),
    hotspotChecks: report.hotspotChecks.length, dynamicChecks: report.dynamicBehavior.length,
    browserErrors: browserErrors.length, badResponses: badResponses.length, mediaRequests: mediaRequests.length,
    cleanup,
  }));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
