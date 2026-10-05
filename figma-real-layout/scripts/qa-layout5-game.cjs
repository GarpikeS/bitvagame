const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const HOST = '127.0.0.1';
const PORT = 5197;
const BASE_URL = `http://${HOST}:${PORT}`;
const ROOT_SELECTOR = '.l5rg-page';
const REFERENCE_WIDTH = 1080;
const RESPONSIVE_TARGET_WIDTH = 540;
const RESPONSIVE_WIDTHS = Object.freeze([390, 768, 1080, 1440]);
const PROFILE_PREFIX = 'bitva-layout5-game-qa-';

const STATES = Object.freeze([
  { id: 'no-category', height: 3699, node: '1:5010', directReference: null },
  { id: 'cover', height: 3857, node: '1:1980', directReference: 'cover.png' },
  { id: 'playing', height: 3581, node: '1:539', directReference: 'game.png' },
  { id: 'paused', height: 3581, node: '1:572', directReference: 'pause.png' },
  { id: 'ended', height: 3581, node: '1:606', directReference: 'ended.png' },
  { id: 'answers', height: 3581, node: '1:638', directReference: 'answers.png' },
  { id: 'second-song', height: 3581, node: '1:539', directReference: null, renderedState: 'playing' },
]);

const BASE_HITS = Object.freeze({
  back: [80, 127, 64, 64],
  'home-title': [144, 107, 598, 123.431],
  balance: [742, 119, 174, 98],
  profile: [918, 117, 90, 100],
  'select-category': [60, 310.4309, 960, 128],
});

function makeUser() {
  return {
    id: 'layout5-game-exact-qa',
    name: 'Тимур',
    email: 'qa@example.test',
    balanceCoins: 11240,
    purchasedBlanks: [],
    purchasedCategories: [],
    gameEntitlements: ['karaoke:girls'],
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
  const result = spawnSync('magick', ['-version'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `ImageMagick is required: ${result.error || result.stderr}`);
}

function runMagick(args, root, label) {
  const result = spawnSync('magick', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${label}: ${result.error || result.stderr || result.stdout}`);
  return result;
}

function identify(image, root) {
  const result = runMagick(['identify', '-format', '%w %h', image], root, `Unable to identify ${image}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  assert.ok(Number.isInteger(width) && Number.isInteger(height), `Unreadable dimensions for ${image}`);
  return { width, height };
}

function compareRawPixels({ actual, diff, reference, root }) {
  const result = spawnSync('magick', [
    'compare', '-metric', 'AE', '-fuzz', '0%', reference, actual, diff,
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.ok([0, 1].includes(result.status), `ImageMagick compare failed: ${result.error || result.stderr}`);
  const metric = String(result.stderr || result.stdout).trim();
  const changedPixels = Number.parseFloat(metric);
  assert.ok(Number.isFinite(changedPixels), `Unreadable ImageMagick AE metric: ${metric}`);
  return { changedPixels, metric };
}

function cropImage({ geometry, input, output, root }) {
  runMagick([input, '-crop', geometry, '+repage', output], root, `Unable to crop ${input} at ${geometry}`);
}

function maskImage({ input, masks, output, root }) {
  const draws = masks.flatMap(([x1, y1, x2, y2]) => ['-draw', `rectangle ${x1},${y1} ${x2},${y2}`]);
  runMagick([input, '-fill', '#000000', ...draws, output], root, `Unable to mask dynamic regions in ${input}`);
}

function dynamicMasks(state) {
  const renderedState = state === 'second-song' ? 'playing' : state;
  const managementCardTop = renderedState === 'cover'
    ? 1829.4309
    : renderedState === 'no-category' ? 1671.4309 : 1971.4309;
  const countTop = managementCardTop + 188;
  const masks = [[90, Math.floor(countTop - 8), 176, Math.ceil(countTop + 68)]];
  if (renderedState !== 'no-category') {
    masks.push([64, 314, 893, 435]);
  }
  if (['playing', 'paused', 'ended', 'answers'].includes(renderedState)) {
    masks.push([670, 1664, 996, 1753]);
  }
  return masks;
}

function compareRegions({ actual, actualGeometry, maskRectangles = [], name, reference, referenceGeometry, root, scratch }) {
  const actualCrop = path.join(scratch, `${name}-actual.png`);
  const referenceCrop = path.join(scratch, `${name}-reference.png`);
  const diff = path.join(scratch, `${name}-diff.png`);
  cropImage({ input: actual, geometry: actualGeometry, output: actualCrop, root });
  cropImage({ input: reference, geometry: referenceGeometry, output: referenceCrop, root });
  let actualForComparison = actualCrop;
  let referenceForComparison = referenceCrop;
  if (maskRectangles.length) {
    actualForComparison = path.join(scratch, `${name}-actual-masked.png`);
    referenceForComparison = path.join(scratch, `${name}-reference-masked.png`);
    maskImage({ input: actualCrop, masks: maskRectangles, output: actualForComparison, root });
    maskImage({ input: referenceCrop, masks: maskRectangles, output: referenceForComparison, root });
  }
  const result = compareRawPixels({ actual: actualForComparison, reference: referenceForComparison, diff, root });
  return { ...result, actualGeometry, referenceGeometry };
}

function closeTo(actual, expected, label, tolerance = 0.1) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ±${tolerance}, received ${actual}`);
}

function assertBox(actual, expected, label, tolerance = 0.1) {
  for (const key of ['x', 'y', 'width', 'height']) {
    closeTo(actual[key], expected[key], `${label}.${key}`, tolerance);
  }
}

function box(x, y, width, height) {
  return { x, y, width, height };
}

function expectedHits(state) {
  const renderedState = state === 'second-song' ? 'playing' : state;
  const result = { ...BASE_HITS };
  const isLive = ['playing', 'paused', 'ended', 'answers'].includes(renderedState);
  const managementTop = renderedState === 'cover'
    ? 1829.4309
    : renderedState === 'no-category' ? 1671.4309 : 1971.4309;

  if (renderedState === 'cover') result.start = [60, 1498.4309, 960, 136];
  if (isLive) {
    result.expand = [850, 585, 116, 116];
    if (renderedState === 'playing' || renderedState === 'paused') {
      result['toggle-pause'] = [805, 1261, 188, 188];
    }
    result['toggle-answers'] = [60, 1498.4309, 960, 122];
    result['new-song'] = [60, 1640.4309, 960, 136];
  }
  result['manage-category'] = [60, managementTop, 960, 144];
  result['played-songs'] = [60, managementTop + 144, 960, 144];
  result['announce-winner'] = [60, managementTop + 288, 960, 144];
  result['new-game'] = [60, managementTop + 432, 960, 144];
  if (!isLive) {
    const footerShift = renderedState === 'no-category' ? -158 : 0;
    result.home = [40, 3440 + footerShift, 490, 190];
    result.privacy = [535, 3620 + footerShift, 410, 62];
  }
  return result;
}

async function waitForImages(page, selector = ROOT_SELECTOR) {
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
}

async function waitForGame(page, state, songVariant = 'primary') {
  const renderedState = state === 'second-song' ? 'playing' : state;
  await page.locator(`${ROOT_SELECTOR}[data-state="${renderedState}"]`).waitFor({ state: 'visible' });
  await page.waitForFunction(({ renderedState: expectedState, songVariant: expectedVariant }) => {
    const root = document.querySelector('.l5rg-page');
    return root?.dataset.state === expectedState
      && root.dataset.songVariant === expectedVariant
      && root.dataset.imageComplete === 'true';
  }, { renderedState, songVariant });
  await waitForImages(page);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

let navigationId = 0;
async function navigateGame(page, category = 'hits') {
  navigationId += 1;
  const query = new URLSearchParams({ layout5GameQa: String(navigationId), qaCategory: category });
  await page.goto(`${BASE_URL}/?${query}#/karaoke-battle-game`, { waitUntil: 'networkidle' });
  await waitForGame(page, category === 'none' ? 'no-category' : 'cover');
}

async function action(page, name) {
  const button = page.locator(`.l5rg-hit[data-action="${name}"]`);
  assert.equal(await button.count(), 1, `Expected exactly one ${name} hotspot`);
  assert.equal(await button.isEnabled(), true, `${name} hotspot is unexpectedly disabled`);
  await button.click();
}

async function setupState(page, state) {
  if (state === 'no-category') {
    await navigateGame(page, 'none');
    return;
  }
  await navigateGame(page, 'hits');
  if (state === 'cover') return;
  await action(page, 'start');
  await waitForGame(page, 'playing');
  if (state === 'playing') return;
  if (state === 'paused') {
    await action(page, 'toggle-pause');
    await waitForGame(page, 'paused');
    return;
  }
  if (state === 'second-song') {
    await action(page, 'new-song');
    await waitForGame(page, 'second-song', 'secondary');
    return;
  }
  await action(page, 'announce-winner');
  await waitForGame(page, 'ended');
  if (state === 'ended') return;
  await action(page, 'toggle-answers');
  await waitForGame(page, 'answers');
}

async function exposeNaturalReferenceCanvas(page) {
  await page.locator(ROOT_SELECTOR).evaluate((element) => {
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

async function gameMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.l5rg-page');
    if (!root) throw new Error('Missing Layout 5 reference game root');
    const rootBounds = root.getBoundingClientRect();
    const relativeBox = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        x: +(bounds.left - rootBounds.left).toFixed(4),
        y: +(bounds.top - rootBounds.top).toFixed(4),
        width: +bounds.width.toFixed(4),
        height: +bounds.height.toFixed(4),
        cssLeft: styles.left,
        cssTop: styles.top,
        overflow: styles.overflow,
        borderRadius: styles.borderRadius,
      };
    };
    const imageData = (image) => ({
      className: image.className,
      frame: image.getAttribute('data-reference-frame'),
      src: image.currentSrc,
      pathname: new URL(image.currentSrc, location.href).pathname,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      borderRadius: getComputedStyle(image).borderRadius,
      ...relativeBox(image),
    });
    return {
      dpr: devicePixelRatio,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      stageScaled: document.querySelector('.responsive-canvas')?.dataset.scaled,
      state: root.dataset.state,
      songVariant: root.dataset.songVariant,
      renderMode: root.dataset.renderMode,
      figmaNode: root.dataset.figmaNode,
      categoryId: root.dataset.categoryId || null,
      categoryTitle: root.dataset.categoryTitle || null,
      compositeSource: root.dataset.figmaCompositeSource || null,
      songNode: root.dataset.figmaSongNode || null,
      imageComplete: root.dataset.imageComplete,
      offsetWidth: root.offsetWidth,
      offsetHeight: root.offsetHeight,
      rootBox: { x: +rootBounds.left.toFixed(4), y: +rootBounds.top.toFixed(4), width: +rootBounds.width.toFixed(4), height: +rootBounds.height.toFixed(4) },
      missingImages: [...root.querySelectorAll('img')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.currentSrc || image.getAttribute('src')),
      images: [...root.querySelectorAll('img')].map(imageData),
      topSlice: relativeBox(root.querySelector('.l5rg-empty-slice--top')),
      bottomSlice: relativeBox(root.querySelector('.l5rg-empty-slice--bottom')),
      songClip: relativeBox(root.querySelector('.l5rg-second-song')),
      controlPatch: relativeBox(root.querySelector('.l5rg-control-patch')),
      selectedCategory: (() => {
        const element = root.querySelector('.l5rg-selected-category');
        if (!element) return null;
        const styles = getComputedStyle(element);
        return {
          ...relativeBox(element),
          text: element.textContent.trim(),
          id: element.dataset.selectedCategoryId,
          title: element.dataset.selectedCategoryTitle,
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          lineHeight: styles.lineHeight,
          textTransform: styles.textTransform,
        };
      })(),
      audioElements: document.querySelectorAll('audio').length,
      videoElements: document.querySelectorAll('video').length,
      mediaPlayCalls: Number(window.__layout5QaMediaPlayCalls || 0),
      routeHash: location.hash,
      layout5Category: localStorage.getItem('bitva:layout5:karaoke-category'),
      legacyMusicCategory: localStorage.getItem('bitva_music_category'),
      legacyMusicSongIndex: localStorage.getItem('bitva_music_song_index'),
      forbiddenMusicRoots: document.querySelectorAll('.music-game-page, .music-song-card, [data-game="music-loto"]').length,
    };
  });
}

async function hotspotMetrics(page) {
  return page.locator('.l5rg-hit').evaluateAll((nodes) => {
    const rootBounds = document.querySelector('.l5rg-page').getBoundingClientRect();
    return nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        action: node.dataset.action,
        label: node.getAttribute('aria-label'),
        disabled: node.disabled,
        x: +(bounds.left - rootBounds.left).toFixed(4),
        y: +(bounds.top - rootBounds.top).toFixed(4),
        width: +bounds.width.toFixed(4),
        height: +bounds.height.toFixed(4),
      };
    });
  });
}

function assertRouteIsolation(metrics, state) {
  assert.equal(metrics.routeHash, '#/karaoke-battle-game', `${state} escaped the karaoke game route`);
  assert.equal(metrics.forbiddenMusicRoots, 0, `${state} rendered Music Lotto UI`);
  assert.equal(metrics.legacyMusicCategory, 'Девичник', `${state} mutated the separate Music Lotto category`);
  assert.equal(metrics.legacyMusicSongIndex, '37', `${state} mutated the separate Music Lotto song index`);
  assert.equal(metrics.layout5Category, state === 'no-category' ? null : 'hits', `${state} has the wrong Layout 5 category`);
}

function assertCommonMetrics(metrics, testCase, { canonical = false } = {}) {
  const renderedState = testCase.renderedState || testCase.id;
  assert.equal(metrics.dpr, 1, `${testCase.id} must render at DPR 1`);
  assert.equal(metrics.state, renderedState, `${testCase.id} rendered the wrong state`);
  assert.equal(metrics.songVariant, testCase.id === 'second-song' ? 'secondary' : 'primary');
  assert.equal(metrics.renderMode, 'figma-raster');
  assert.equal(metrics.figmaNode, testCase.node);
  assert.equal(metrics.imageComplete, 'true');
  assert.equal(metrics.offsetWidth, REFERENCE_WIDTH);
  assert.equal(metrics.offsetHeight, testCase.height);
  assert.deepEqual(metrics.missingImages, []);
  assert.equal(metrics.audioElements, 0, `${testCase.id} created an <audio> element`);
  assert.equal(metrics.videoElements, 0, `${testCase.id} created a <video> element`);
  assert.equal(metrics.mediaPlayCalls, 0, `${testCase.id} attempted media playback`);
  assert.ok(metrics.documentWidth <= metrics.viewportWidth, `${testCase.id} document overflow: ${metrics.documentWidth}/${metrics.viewportWidth}`);
  assert.ok(metrics.bodyWidth <= metrics.viewportWidth, `${testCase.id} body overflow: ${metrics.bodyWidth}/${metrics.viewportWidth}`);
  if (canonical) {
    assert.equal(metrics.stageScaled, 'false');
    assertBox(metrics.rootBox, box(0, 0, REFERENCE_WIDTH, testCase.height), `${testCase.id}.root`, 0.01);
  }
  assertRouteIsolation(metrics, testCase.id);
  if (renderedState === 'no-category') {
    assert.equal(metrics.categoryId, null);
    assert.equal(metrics.categoryTitle, null);
    assert.equal(metrics.selectedCategory, null);
  } else {
    assert.equal(metrics.categoryId, 'hits');
    assert.equal(metrics.categoryTitle, 'Хиты караоке');
    assert.equal(metrics.selectedCategory.text, 'Хиты караоке');
    assert.equal(metrics.selectedCategory.id, 'hits');
    assert.equal(metrics.selectedCategory.title, 'Хиты караоке');
    if (canonical) {
      assertBox(metrics.selectedCategory, box(65, 315.4309, 827, 118), `${testCase.id}.selected-category`);
    }
    assert.equal(metrics.selectedCategory.backgroundColor, 'rgb(243, 243, 243)');
    assert.equal(metrics.selectedCategory.color, 'rgb(35, 35, 35)');
    assert.equal(metrics.selectedCategory.fontSize, '82.533px');
    assert.equal(metrics.selectedCategory.fontWeight, '700');
    assert.equal(metrics.selectedCategory.textTransform, 'uppercase');
  }
}

function assertHotspots(hotspots, state) {
  const expected = expectedHits(state);
  const actions = hotspots.map(hit => hit.action);
  assert.equal(new Set(actions).size, actions.length, `${state} contains duplicate hotspot actions`);
  assert.deepEqual([...actions].sort(), Object.keys(expected).sort(), `${state} hotspot inventory differs`);
  for (const hit of hotspots) {
    assert.ok(hit.label, `${state}/${hit.action} needs an accessible label`);
    if (hit.action === 'select-category') {
      assert.equal(
        hit.label,
        state === 'no-category' ? 'Выбрать категорию' : 'Категория: Хиты караоке. Сменить категорию',
      );
    }
    const [x, y, width, height] = expected[hit.action];
    assertBox(hit, box(x, y, width, height), `${state}.hotspot.${hit.action}`);
    const renderedState = state === 'second-song' ? 'playing' : state;
    const shouldBeDisabled = hit.action === 'toggle-answers'
      && (renderedState === 'playing' || renderedState === 'paused');
    assert.equal(hit.disabled, shouldBeDisabled, `${state}/${hit.action} disabled state differs`);
  }
}

function findImage(metrics, predicate, label) {
  const matches = metrics.images.filter(predicate);
  assert.equal(matches.length, 1, `${label}: expected one image, found ${matches.length}`);
  return matches[0];
}

function assertDirectFrame(metrics, testCase) {
  assert.equal(metrics.compositeSource, null);
  const frame = findImage(metrics, image => image.frame === 'full', `${testCase.id}.full-frame`);
  assert.ok(frame.pathname.endsWith(`/reference/layout5/${testCase.directReference}`), `${testCase.id} uses ${frame.pathname}`);
  assert.equal(frame.naturalWidth, REFERENCE_WIDTH);
  assert.equal(frame.naturalHeight, testCase.height);
  assertBox(frame, box(0, 0, REFERENCE_WIDTH, testCase.height), `${testCase.id}.frame`, 0.01);
}

function assertNoCategoryComposite(metrics) {
  assert.equal(metrics.compositeSource, '1:1980,1:5010');
  assert.equal(metrics.songNode, null);
  assert.equal(metrics.images.length, 3);
  assertBox(metrics.topSlice, box(0, 0, 1080, 518.4309), 'no-category.top-slice');
  assertBox(metrics.bottomSlice, box(0, 1556.4309, 1080, 2142.5691), 'no-category.bottom-slice');
  assert.equal(metrics.topSlice.overflow, 'hidden');
  assert.equal(metrics.bottomSlice.overflow, 'hidden');

  const top = findImage(metrics, image => image.frame === 'top', 'no-category.top-cover');
  const art = findImage(metrics, image => image.frame === 'empty', 'no-category.empty-art');
  const bottom = findImage(metrics, image => image.frame === 'bottom', 'no-category.bottom-cover');
  for (const cover of [top, bottom]) {
    assert.ok(cover.pathname.endsWith('/reference/layout5/cover.png'));
    assert.equal(cover.naturalWidth, 1080);
    assert.equal(cover.naturalHeight, 3857);
  }
  assert.ok(art.pathname.endsWith('/reference/layout5/empty.png'));
  assert.equal(art.naturalWidth, 960);
  assert.equal(art.naturalHeight, 958);
  assert.equal(art.borderRadius, '80px', 'no-category empty art must clip the baked dark corners');
  assertBox(top, box(0, 0, 1080, 3857), 'no-category.top-cover');
  assertBox(art, box(60, 518.4309, 960, 958), 'no-category.empty-art');
  assertBox(bottom, box(0, -158, 1080, 3857), 'no-category.bottom-cover');
}

function assertSecondSongComposite(metrics) {
  assert.equal(metrics.compositeSource, null);
  assert.equal(metrics.songNode, '1:3829');
  assert.equal(metrics.images.length, 3);
  const base = findImage(metrics, image => image.frame === 'full', 'second-song.base');
  const sheet = findImage(metrics, image => image.className.includes('l5rg-second-song-sheet'), 'second-song.sheet');
  const patch = findImage(metrics, image => image.className.includes('l5rg-control-patch-frame'), 'second-song.control-patch');
  assert.ok(base.pathname.endsWith('/reference/layout5/game.png'));
  assertBox(base, box(0, 0, 1080, 3581), 'second-song.base');
  assert.ok(sheet.pathname.endsWith('/reference/layout5/songs.png'));
  assert.equal(sheet.naturalWidth, 2089);
  assert.equal(sheet.naturalHeight, 2147);
  assertBox(metrics.songClip, box(60, 518.4309, 960, 960), 'second-song.clip');
  assert.equal(metrics.songClip.overflow, 'hidden');
  assert.equal(metrics.songClip.borderRadius, '80px');
  assertBox(sheet, box(1, -578.5691, 2089, 2147), 'second-song.sheet');
  assert.ok(patch.pathname.endsWith('/reference/layout5/game.png'));
  assert.equal(patch.naturalWidth, 1080);
  assert.equal(patch.naturalHeight, 3581);
  assertBox(metrics.controlPatch, box(821, 1277.7434, 156, 156), 'second-song.control-clip');
  assert.equal(metrics.controlPatch.overflow, 'hidden');
  assert.equal(metrics.controlPatch.borderRadius, '50%');
  assertBox(patch, box(0, 0, 1080, 3581), 'second-song.control-patch');
}

async function captureCanonical({ output, page, root, scratch, testCase }) {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 900 });
  await setupState(page, testCase.id);
  await exposeNaturalReferenceCanvas(page);
  const metrics = await gameMetrics(page);
  assertCommonMetrics(metrics, testCase, { canonical: true });
  const hotspots = await hotspotMetrics(page);
  assertHotspots(hotspots, testCase.id);
  if (testCase.directReference) assertDirectFrame(metrics, testCase);
  else if (testCase.id === 'no-category') assertNoCategoryComposite(metrics);
  else assertSecondSongComposite(metrics);

  const screenshot = path.join(output, `${testCase.id}-1080.png`);
  await page.locator(ROOT_SELECTOR).screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
  assert.deepEqual(identify(screenshot, root), { width: 1080, height: testCase.height });

  let pixelComparison = null;
  let compositionChecks = null;
  if (testCase.directReference) {
    const reference = path.join(root, 'reference', 'layout5', testCase.directReference);
    assert.deepEqual(identify(reference, root), { width: 1080, height: testCase.height });
    const masks = dynamicMasks(testCase.id);
    const maskedActual = path.join(scratch, `${testCase.id}-actual-masked.png`);
    const maskedReference = path.join(scratch, `${testCase.id}-reference-masked.png`);
    maskImage({ input: screenshot, masks, output: maskedActual, root });
    maskImage({ input: reference, masks, output: maskedReference, root });
    pixelComparison = {
      ...compareRawPixels({ actual: maskedActual, reference: maskedReference, diff: path.join(output, `${testCase.id}-raw-diff.png`), root }),
      dynamicMasks: masks,
    };
    assert.equal(pixelComparison.changedPixels, 0, `${testCase.id} differs from Figma by ${pixelComparison.changedPixels} pixels`);
  } else if (testCase.id === 'no-category') {
    const cover = path.join(root, 'reference', 'layout5', 'cover.png');
    const top = compareRegions({ actual: screenshot, actualGeometry: '1080x500+0+0', name: 'no-category-top', reference: cover, referenceGeometry: '1080x500+0+0', root, scratch });
    const bottom = compareRegions({
      actual: screenshot,
      actualGeometry: '1080x1800+0+1600',
      maskRectangles: dynamicMasks('no-category').map(([x1, y1, x2, y2]) => [x1, y1 - 1600, x2, y2 - 1600]),
      name: 'no-category-bottom',
      reference: cover,
      referenceGeometry: '1080x1800+0+1758',
      root,
      scratch,
    });
    assert.equal(top.changedPixels, 0, 'No-category top slice differs from cover.png');
    assert.equal(bottom.changedPixels, 0, 'No-category bottom slice differs from cover.png shifted by -158px');
    compositionChecks = { top, bottom, sourceNodes: ['1:1980', '1:5010'] };
  } else {
    const game = path.join(root, 'reference', 'layout5', 'game.png');
    const top = compareRegions({
      actual: screenshot,
      actualGeometry: '1080x500+0+0',
      maskRectangles: [[64, 314, 893, 435]],
      name: 'second-song-unmodified-top',
      reference: game,
      referenceGeometry: '1080x500+0+0',
      root,
      scratch,
    });
    const bottom = compareRegions({
      actual: screenshot,
      actualGeometry: '1080x2000+0+1500',
      maskRectangles: dynamicMasks('second-song').map(([x1, y1, x2, y2]) => [x1, y1 - 1500, x2, y2 - 1500]),
      name: 'second-song-unmodified-bottom',
      reference: game,
      referenceGeometry: '1080x2000+0+1500',
      root,
      scratch,
    });
    // Stay well inside the circular clip: its corners intentionally retain the song sheet.
    const restoredControl = compareRegions({ actual: screenshot, actualGeometry: '90x90+854+1310', name: 'second-song-restored-control', reference: game, referenceGeometry: '90x90+854+1310', root, scratch });
    const replacedSong = compareRegions({ actual: screenshot, actualGeometry: '880x650+100+600', name: 'second-song-replaced-song', reference: game, referenceGeometry: '880x650+100+600', root, scratch });
    assert.equal(top.changedPixels, 0, 'Second-song composition changed pixels above its clip');
    assert.equal(bottom.changedPixels, 0, 'Second-song composition changed pixels below its clip');
    assert.equal(restoredControl.changedPixels, 0, 'Second-song control patch does not restore game.png exactly');
    assert.ok(replacedSong.changedPixels > 1000, 'Second-song sheet did not visibly replace the first song');
    compositionChecks = { top, bottom, restoredControl, replacedSong, songSheetSource: 'songs.png crop 960x960+59+1097', controlPatchSource: 'game.png crop 156x156+821+1277.7434' };
  }
  return { state: testCase.id, screenshot: path.relative(root, screenshot), metrics, hotspots, pixelComparison, compositionChecks };
}

async function captureResponsive({ output, page, root, testCase, width }) {
  await page.setViewportSize({ width, height: 900 });
  await setupState(page, testCase.id);
  const metrics = await gameMetrics(page);
  assertCommonMetrics(metrics, testCase);
  const expectedPhysicalWidth = Math.min(width, RESPONSIVE_TARGET_WIDTH);
  const expectedScale = expectedPhysicalWidth / REFERENCE_WIDTH;
  closeTo(metrics.rootBox.width, expectedPhysicalWidth, `${testCase.id}@${width}.width`, 0.02);
  closeTo(metrics.rootBox.height, testCase.height * expectedScale, `${testCase.id}@${width}.height`, 0.15);
  assert.equal(metrics.stageScaled, width < RESPONSIVE_TARGET_WIDTH ? 'true' : 'false');
  const screenshot = path.join(output, `${testCase.id}-responsive-${width}.png`);
  await page.locator(ROOT_SELECTOR).screenshot({ path: screenshot, animations: 'disabled', caret: 'hide', scale: 'device' });
  const dimensions = identify(screenshot, root);
  closeTo(dimensions.width, expectedPhysicalWidth, `${testCase.id}@${width}.screenshot-width`, 1);
  return { width, expectedScale, screenshot: path.relative(root, screenshot), dimensions, metrics };
}

async function waitForHash(page, route) {
  const expectedHash = route === 'home' ? '#/' : `#/${route}`;
  await page.waitForFunction(hash => location.hash === hash, expectedHash);
  return expectedHash;
}

async function assertDestinationHealthy(page, route) {
  const expectedHash = await waitForHash(page, route);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const result = await page.evaluate(() => ({
    hash: location.hash,
    audioElements: document.querySelectorAll('audio').length,
    mediaPlayCalls: Number(window.__layout5QaMediaPlayCalls || 0),
    brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0)
      .map(image => image.currentSrc || image.getAttribute('src')),
  }));
  assert.equal(result.hash, expectedHash);
  assert.equal(result.audioElements, 0, `${route} created an <audio> element`);
  assert.equal(result.mediaPlayCalls, 0, `${route} attempted media playback`);
  assert.deepEqual(result.brokenImages, [], `${route} contains broken images`);
  return result;
}

async function exerciseRouteHotspots(page) {
  const cases = [
    ['cover', 'back', 'karaoke-battle-categories'],
    ['cover', 'home-title', 'home'],
    ['cover', 'balance', 'balance-top-up'],
    ['cover', 'profile', 'profile'],
    ['cover', 'select-category', 'karaoke-battle-categories'],
    ['cover', 'manage-category', 'karaoke-battle-categories'],
    ['cover', 'played-songs', 'karaoke-battle-viewed-songs'],
    ['cover', 'home', 'home'],
    ['cover', 'privacy', 'privacy'],
    ['playing', 'expand', 'karaoke-battle-fullscreen-landscape-hidden'],
    ['answers', 'expand', 'karaoke-battle-fullscreen-landscape-answers'],
  ];
  const results = [];
  await page.setViewportSize({ width: 1080, height: 900 });
  for (const [state, actionName, expectedRoute] of cases) {
    await setupState(page, state);
    await action(page, actionName);
    const destination = await assertDestinationHealthy(page, expectedRoute);
    results.push({ state, action: actionName, expectedRoute, destination });
  }
  return results;
}

async function exerciseStateHotspots(page) {
  const results = [];
  await page.setViewportSize({ width: 1080, height: 900 });
  await setupState(page, 'cover');
  await action(page, 'start');
  await waitForGame(page, 'playing');
  results.push({ action: 'start', from: 'cover', to: 'playing' });

  const disabledInPlaying = page.locator('.l5rg-hit[data-action="toggle-answers"]');
  assert.equal(await disabledInPlaying.isDisabled(), true);
  await disabledInPlaying.evaluate(button => button.click());
  await page.waitForTimeout(50);
  assert.equal(await page.locator(ROOT_SELECTOR).getAttribute('data-state'), 'playing');
  results.push({ action: 'toggle-answers', from: 'playing', to: 'playing', result: 'disabled' });

  await action(page, 'toggle-pause');
  await waitForGame(page, 'paused');
  results.push({ action: 'toggle-pause', from: 'playing', to: 'paused' });
  const disabledInPaused = page.locator('.l5rg-hit[data-action="toggle-answers"]');
  assert.equal(await disabledInPaused.isDisabled(), true);
  await disabledInPaused.evaluate(button => button.click());
  await page.waitForTimeout(50);
  assert.equal(await page.locator(ROOT_SELECTOR).getAttribute('data-state'), 'paused');
  results.push({ action: 'toggle-answers', from: 'paused', to: 'paused', result: 'disabled' });

  await action(page, 'toggle-pause');
  await waitForGame(page, 'playing');
  results.push({ action: 'toggle-pause', from: 'paused', to: 'playing' });
  await action(page, 'announce-winner');
  await waitForGame(page, 'ended');
  results.push({ action: 'announce-winner', from: 'playing', to: 'ended' });
  await action(page, 'toggle-answers');
  await waitForGame(page, 'answers');
  results.push({ action: 'toggle-answers', from: 'ended', to: 'answers' });
  await action(page, 'toggle-answers');
  await waitForGame(page, 'ended');
  results.push({ action: 'toggle-answers', from: 'answers', to: 'ended' });

  await action(page, 'new-song');
  await waitForGame(page, 'second-song', 'secondary');
  const secondSong = await page.evaluate(() => ({
    copy: document.querySelector('.l5rg-visually-hidden h2')?.textContent.trim(),
    remaining: [...document.querySelectorAll('.l5rg-visually-hidden p')].map(node => node.textContent.trim())
      .find(text => text.startsWith('Осталось песен:')),
    category: localStorage.getItem('bitva:layout5:karaoke-category'),
    legacyCategory: localStorage.getItem('bitva_music_category'),
    legacyIndex: localStorage.getItem('bitva_music_song_index'),
  }));
  assert.equal(secondSong.copy, 'Корни — Ты узнаешь её');
  assert.equal(secondSong.remaining, 'Осталось песен: 9. Выпавшие песни: 1.');
  assert.equal(await page.locator('.l5rg-played-count').textContent(), '1');
  assert.equal(await page.locator('.l5rg-remaining-count').textContent(), 'осталось 9 песен');
  assert.deepEqual({ category: secondSong.category, legacyCategory: secondSong.legacyCategory, legacyIndex: secondSong.legacyIndex },
    { category: 'hits', legacyCategory: 'Девичник', legacyIndex: '37' });
  results.push({ action: 'new-song', from: 'ended', to: 'playing:secondary', secondSong });
  await action(page, 'new-game');
  await waitForGame(page, 'cover');
  assert.equal(await page.locator('.l5rg-played-count').textContent(), '0');
  const resetCopy = await page.locator('.l5rg-visually-hidden').textContent();
  assert.ok(!resetCopy.includes('Осталось песен:'), 'Cover should not expose live-song copy after reset');
  results.push({ action: 'new-game', from: 'playing:secondary', to: 'cover' });

  await setupState(page, 'no-category');
  await action(page, 'new-game');
  await waitForGame(page, 'no-category');
  results.push({ action: 'new-game', from: 'no-category', to: 'no-category' });
  return results;
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
  const output = path.join(root, 'qa', 'layout5-game');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  assertImageMagick(root);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), PROFILE_PREFIX));
  const scratch = path.join(profile, 'imagemagick-scratch');
  await fs.mkdir(scratch, { recursive: true });
  console.log(`QA_PROFILE=${profile}`);

  const { createServer } = await import('vite');
  const browserErrors = [];
  const consoleErrors = [];
  const badResponses = [];
  const mediaRequests = [];
  const direct = [];
  const responsive = [];
  let server;
  let context;
  let runError = null;
  let report = null;
  let cleanup = null;

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
      window.__layout5QaMediaPlayCalls = 0;
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() { window.__layout5QaMediaPlayCalls += 1; this.pause(); return Promise.resolve(); },
      });
      Math.random = () => 0;
      const params = new URLSearchParams(location.search);
      if (!params.has('layout5GameQa')) return;
      localStorage.clear();
      localStorage.setItem('bitva_logged_in', '1');
      localStorage.setItem('bitva_name', 'Тимур');
      localStorage.setItem('bitva_balance', '11240');
      localStorage.setItem('bitva_music_category', 'Девичник');
      localStorage.setItem('bitva_music_song_index', '37');
      if (params.get('qaCategory') !== 'none') localStorage.setItem('bitva:layout5:karaoke-category', 'hits');
    });
    await context.route('**/api/**', route => json(route, { user: makeUser() }));

    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(pathname)) mediaRequests.push(request.url());
    });

    for (const testCase of STATES) direct.push(await captureCanonical({ output, page, root, scratch, testCase }));
    for (const testCase of STATES) {
      const viewports = [];
      for (const width of RESPONSIVE_WIDTHS) viewports.push(await captureResponsive({ output, page, root, testCase, width }));
      responsive.push({ state: testCase.id, viewports });
    }

    const routeHotspots = await exerciseRouteHotspots(page);
    const stateHotspots = await exerciseStateHotspots(page);
    const expectedActionNames = new Set(STATES.flatMap(testCase => Object.keys(expectedHits(testCase.id))));
    const exercisedActionNames = new Set([...routeHotspots.map(item => item.action), ...stateHotspots.map(item => item.action)]);
    assert.deepEqual([...exercisedActionNames].sort(), [...expectedActionNames].sort(), 'Not every transparent hotspot action was exercised');
    assert.deepEqual(browserErrors, [], `Browser page errors:\n${browserErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors:\n${consoleErrors.join('\n')}`);
    assert.deepEqual(badResponses, [], `HTTP >=400 responses:\n${badResponses.join('\n')}`);
    assert.deepEqual(mediaRequests, [], `Unexpected media/audio requests:\n${mediaRequests.join('\n')}`);

    report = {
      checkedAt: new Date().toISOString(), route: 'karaoke-battle-game', renderer: 'figma-raster',
      referenceWidth: REFERENCE_WIDTH, deviceScaleFactor: 1, pixelMetric: 'ImageMagick AE, fuzz 0%',
      exactFigmaFrames: direct, responsive, routeHotspots, stateHotspots,
      expectedActionNames: [...expectedActionNames].sort(), browserErrors, consoleErrors, badResponses, mediaRequests,
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
  console.log(JSON.stringify({
    status: 'PASS', exactStates: direct.length,
    directRawPixelDiffs: direct.filter(item => item.pixelComparison).map(item => ({ state: item.state, changedPixels: item.pixelComparison.changedPixels })),
    compositeStates: direct.filter(item => item.compositionChecks).map(item => item.state),
    responsiveScreenshots: responsive.reduce((sum, item) => sum + item.viewports.length, 0),
    hotspotActions: report.expectedActionNames.length, routeHotspotChecks: report.routeHotspots.length,
    stateTransitionChecks: report.stateHotspots.length, browserErrors: browserErrors.length,
    badResponses: badResponses.length, mediaRequests: mediaRequests.length, cleanup,
  }));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
