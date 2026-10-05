const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.KARAOKE_MEDIA_BASE_URL || 'http://127.0.0.1:5173';
const TIMEOUT = Number(process.env.KARAOKE_MEDIA_TIMEOUT || 45_000);
const OUTPUT = path.resolve(__dirname, '..', 'artifacts', 'karaoke-media-qa');

const READY_COVER_BY_PACK_ID = Object.freeze({
  'hits-free': '/figma-assets/music-category-karaoke-figma.png',
  '90-1': '/figma-assets/layout7/90-cover-clean.png',
  '2000-1': '/generated/layout5/category-b3.png',
  '2010-1': '/figma-assets/layout7/2010-cover-clean-v2.png',
});

const hasYandexMediaRequest = () => performance.getEntriesByType('resource').some(entry => (
  entry.name.includes('cloud-api.yandex.net') || entry.name.includes('downloader.disk.yandex.ru')
));

const user = {
  id: 'karaoke-media-qa',
  name: 'Видео QA',
  email: 'karaoke-media@example.test',
  balanceCoins: 1000,
  purchasedBlanks: [],
  purchasedCategories: [],
  gameEntitlements: ['karaoke:90-1', 'karaoke:2000-1', 'karaoke:2010-1'],
};

function routeUrl(route) {
  const url = new URL(BASE_URL);
  url.hash = '/' + route;
  return url.href;
}

async function waitForVideo(page) {
  const video = page.locator('video[aria-label^="Караоке:"]').first();
  await video.waitFor({ state: 'attached', timeout: TIMEOUT });
  await page.waitForFunction(() => {
    const element = document.querySelector('video[aria-label^="Караоке:"]');
    return element && element.readyState >= HTMLMediaElement.HAVE_METADATA;
  }, null, { timeout: TIMEOUT });
  return video;
}

async function waitForRenderedFrame(video) {
  await video.evaluate(element => new Promise(resolve => {
    if (typeof element.requestVideoFrameCallback === 'function') {
      element.requestVideoFrameCallback(() => resolve());
      return;
    }
    setTimeout(resolve, 250);
  }));
}

async function seekVideo(video, seconds) {
  await video.evaluate((element, { targetSeconds }) => new Promise(resolve => {
    const target = Math.min(targetSeconds, element.duration / 2);
    const finish = () => {
      if (typeof element.requestVideoFrameCallback === 'function') {
        element.requestVideoFrameCallback(() => resolve());
      } else {
        setTimeout(resolve, 250);
      }
    };
    element.addEventListener('seeked', finish, { once: true });
    element.currentTime = target;
  }), { targetSeconds: seconds });
}

async function openPack(page, packId) {
  assert.ok(READY_COVER_BY_PACK_ID[packId], `expected ready cover is declared for ${packId}`);
  await page.goto('about:blank');
  await page.goto(routeUrl('karaoke-battle-categories'), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT,
  });
  await page.evaluate((id) => {
    localStorage.setItem('bitva:layout7:karaoke-pack', id);
    localStorage.setItem('bitva:layout7:karaoke-song-index', '0');
    localStorage.setItem('bitva:layout7:karaoke-remaining', '12');
  }, packId);
  await page.goto(routeUrl('karaoke-battle-game'), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT,
  });
  const readyStage = page.locator('.l7-pack-ready');
  await readyStage.waitFor({ state: 'visible', timeout: TIMEOUT });
  const readyCover = readyStage.locator(':scope > img');
  assert.equal(await readyCover.count(), 1, `${packId} renders exactly one ready cover`);
  assert.equal(
    new URL(await readyCover.getAttribute('src'), BASE_URL).pathname,
    READY_COVER_BY_PACK_ID[packId],
    `${packId} uses its clean ready cover`,
  );
  assert.equal(
    await readyStage.locator('button, .l7-pack-info-button, .l7-pack-action-pill').count(),
    0,
    `${packId} ready cover has no catalog controls`,
  );
  assert.doesNotMatch(
    await readyStage.innerText(),
    /\?|\d+\s*монет/i,
    `${packId} ready cover has no question or price copy`,
  );
  assert.equal(await page.locator('video[aria-label^="Караоке:"]').count(), 0, 'video is not mounted before the user starts the game');
  assert.equal(await page.evaluate(hasYandexMediaRequest), false, 'Yandex media is not requested before the user starts the game');
  assert.equal((await page.locator('.l7-button--new-song').innerText()).includes('НАЧАТЬ ИГРУ'), true);
  await page.locator('.l7-button--new-song').click();
  const video = await waitForVideo(page);
  assert.equal(await page.locator('.l7-pack-ready').count(), 0, 'ready cover is removed after start');
  await page.waitForFunction(hasYandexMediaRequest, null, { timeout: TIMEOUT });
  assert.equal(await page.evaluate(hasYandexMediaRequest), true, 'Yandex media is requested only after start');
  return video;
}

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const context = await browser.newContext({ viewport: { width: 540, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user }),
  }));

  try {
    let video = await openPack(page, 'hits-free');
    let facts = await video.evaluate(element => ({
      height: element.videoHeight,
      label: element.getAttribute('aria-label'),
      source: element.currentSrc,
      width: element.videoWidth,
    }));
    assert.equal(facts.label, 'Караоке: IOWA — Маршрутка');
    assert.ok(facts.source.startsWith('http'));
    assert.equal(facts.width, facts.height, 'free karaoke hits use the square source in the game');
    await seekVideo(video, 5);
    await page.screenshot({ path: path.join(OUTPUT, 'hits-free-game-540.png'), fullPage: true });

    await page.locator('.l7-button--answers').click();
    let answers = page.locator('.l7-song-stage .l7-answer-sheet img');
    await answers.waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForFunction(() => {
      const image = document.querySelector('.l7-song-stage .l7-answer-sheet img');
      return image && image.naturalWidth > 0 && image.classList.contains('is-ready');
    }, null, { timeout: TIMEOUT });
    const freeAnswerSize = await answers.evaluate(image => ({ height: image.naturalHeight, width: image.naturalWidth }));
    assert.equal(freeAnswerSize.width, 1080);
    assert.ok(freeAnswerSize.height > 3000, 'free karaoke hits use the supplied correct-words PNG');
    await page.locator('.l7-song-stage').screenshot({ path: path.join(OUTPUT, 'hits-free-answers-stage.png') });

    video = await openPack(page, '90-1');
    facts = await video.evaluate(element => ({
      height: element.videoHeight,
      label: element.getAttribute('aria-label'),
      source: element.currentSrc,
      width: element.videoWidth,
    }));
    assert.equal(facts.label, 'Караоке: Мираж — Музыка нас связала');
    assert.ok(facts.source.startsWith('http'));
    assert.equal(facts.width, 1080);
    assert.equal(facts.height, 1080);
    await page.screenshot({ path: path.join(OUTPUT, '90-game-540.png'), fullPage: true });
    await page.locator('.l7-button--answers').click();
    answers = page.locator('.l7-song-stage .l7-answer-sheet img');
    await answers.waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForFunction(() => {
      const image = document.querySelector('.l7-song-stage .l7-answer-sheet img');
      return image && image.naturalWidth > 0 && image.classList.contains('is-ready');
    }, null, { timeout: TIMEOUT });
    const ninetiesAnswerSize = await answers.evaluate(image => ({ height: image.naturalHeight, width: image.naturalWidth }));
    assert.equal(ninetiesAnswerSize.width, 1080);
    assert.equal(ninetiesAnswerSize.height, 2445);
    await page.locator('.l7-button--answers').click();
    const ninetiesFirstSource = await video.evaluate(element => element.currentSrc);
    await page.locator('.l7-button--new-song').click();
    video = await waitForVideo(page);
    await page.waitForFunction((source) => {
      const element = document.querySelector('video[aria-label^="Караоке:"]');
      return element && element.currentSrc && element.currentSrc !== source;
    }, ninetiesFirstSource, { timeout: TIMEOUT });
    assert.equal(await video.getAttribute('aria-label'), 'Караоке: Михаил Шуфутинский — 3-е Сентября');

    video = await openPack(page, '2000-1');
    facts = await video.evaluate(element => ({
      height: element.videoHeight,
      label: element.getAttribute('aria-label'),
      objectFit: getComputedStyle(element).objectFit,
      source: element.currentSrc,
      width: element.videoWidth,
    }));
    assert.equal(facts.label, 'Караоке: ВИА ГРА — Попытка №5');
    assert.ok(facts.source.startsWith('http'));
    assert.equal(facts.objectFit, 'contain');
    assert.ok(facts.width > facts.height, '00-е square source keeps its near-square source ratio');

    await page.waitForFunction(() => !document.querySelector('video[aria-label^="Караоке:"]').paused, null, { timeout: TIMEOUT });
    await page.locator('.l7-song-stage .l7-media-toggle').click();
    await page.waitForFunction(() => document.querySelector('video[aria-label^="Караоке:"]').paused, null, { timeout: TIMEOUT });
    await page.locator('.l7-song-stage .l7-media-toggle').click();
    await page.waitForFunction(() => !document.querySelector('video[aria-label^="Караоке:"]').paused, null, { timeout: TIMEOUT });

    await seekVideo(video, 60);
    await page.screenshot({ path: path.join(OUTPUT, '2000-game-540.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.l7-expand').click();
    await page.waitForURL(/karaoke-battle-fullscreen-landscape-hidden$/, { timeout: TIMEOUT });
    video = await waitForVideo(page);
    await waitForRenderedFrame(video);
    facts = await video.evaluate(element => ({
      currentTime: element.currentTime,
      height: element.videoHeight,
      width: element.videoWidth,
    }));
    assert.ok(facts.width / facts.height > 1.6, 'fullscreen loads the landscape source');
    assert.ok(facts.currentTime >= 55, 'fullscreen keeps the playback position');
    await page.screenshot({ path: path.join(OUTPUT, '2000-fullscreen-1280.png') });

    await page.locator('.l7-fullscreen-exit').click();
    await page.waitForURL(/karaoke-battle-game$/, { timeout: TIMEOUT });
    await page.setViewportSize({ width: 540, height: 1000 });
    await page.locator('.l7-button--answers').click();
    answers = page.locator('.l7-song-stage .l7-answer-sheet img');
    await answers.waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForFunction(() => {
      const image = document.querySelector('.l7-song-stage .l7-answer-sheet img');
      return image && image.naturalWidth > 0 && image.classList.contains('is-ready');
    }, null, { timeout: TIMEOUT });
    await answers.evaluate(image => image.decode());
    const answerSize = await answers.evaluate(image => ({ height: image.naturalHeight, width: image.naturalWidth }));
    assert.equal(answerSize.width, 1080);
    assert.ok(answerSize.height > 3000, 'the correct-words sheet is the supplied long PNG');
    await page.locator('.l7-song-stage').screenshot({ path: path.join(OUTPUT, '2000-answers-stage.png') });

    video = await openPack(page, '2010-1');
    await waitForRenderedFrame(video);
    facts = await video.evaluate(element => ({
      height: element.videoHeight,
      label: element.getAttribute('aria-label'),
      width: element.videoWidth,
    }));
    assert.equal(facts.label, 'Караоке: Нюша — Выше');
    assert.equal(facts.width, facts.height);
    await page.screenshot({ path: path.join(OUTPUT, '2010-game-540.png'), fullPage: true });
    const firstSource = await video.evaluate(element => element.currentSrc);
    await page.locator('.l7-button--new-song').click();
    video = await waitForVideo(page);
    await page.waitForFunction((source) => {
      const element = document.querySelector('video[aria-label^="Караоке:"]');
      return element && element.currentSrc && element.currentSrc !== source;
    }, firstSource, { timeout: TIMEOUT });
    assert.equal(await video.getAttribute('aria-label'), 'Караоке: Ленинград — Вояж');

    assert.deepEqual(pageErrors, []);
    process.stdout.write('Karaoke media QA passed: clean covers for free, 90s, 2000s and 2010s themes; Yandex video only after start; playback, pause, next song, answers and landscape fullscreen.\n');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
