const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BITVA_BASE_URL || 'https://bitvagame.ru';
const OUTPUT = path.resolve(__dirname, '..', 'qa', 'production', 'purchases-figma-production.png');

const user = {
  id: 'production-visual-qa',
  name: 'Тимур',
  username: 'timur',
  email: 'qa@example.test',
  balanceCoins: 11240,
  purchasedBlanks: [{
    id: 'qa-blank',
    category: 'Девичник',
    count: 2,
    date: '01.01.2026',
    packSeed: 'qa',
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
  purchasedMusicCategories: [],
  gameEntitlements: ['karaoke:girls', 'karaoke:2000s', 'karaoke:girls', 'royal:birthday'],
};

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-production-purchases-'));
  let context;
  const pageErrors = [];
  const mediaRequests = [];

  try {
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      args: [
        '--mute-audio',
        '--no-first-run',
        '--disable-background-networking',
        '--autoplay-policy=user-gesture-required',
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

    await context.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/me') return json(route, { user });
      return json(route, { user });
    });

    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (request.resourceType() === 'media') mediaRequests.push(request.url());
    });

    await page.goto(`${BASE_URL}/?qa=${Date.now()}#/karaoke-battle-purchases`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('.l5x-purchase-overview').waitFor({ state: 'visible' });
    await page.waitForFunction(() => [...document.querySelectorAll('.l5x-purchase-live-art')]
      .every(image => image.complete && image.naturalWidth > 0));

    const metrics = await page.locator('.l5x-purchase-overview').evaluate(element => {
      const cards = [...element.querySelectorAll('.l5x-purchase-live-card')];
      const showAll = element.querySelector('.l5x-purchase-show-all');
      const round = value => Math.round(Number.parseFloat(value) * 10) / 10;
      return {
        figmaNode: document.querySelector('.l5x-page')?.dataset.figmaNode,
        cardCount: cards.length,
        ids: cards.map(card => card.dataset.purchaseId),
        tops: cards.map(card => card.offsetTop),
        sizes: cards.map(card => {
          const style = getComputedStyle(card);
          return [round(style.width), round(style.height)];
        }),
        sources: cards.map(card => card.querySelector('img')?.getAttribute('src')),
        presentation: cards.map(card => {
          const style = getComputedStyle(card.querySelector('img'));
          return {
            opacity: style.opacity,
            filter: style.filter,
            maskImage: style.maskImage,
            mixBlendMode: style.mixBlendMode,
            objectFit: style.objectFit,
          };
        }),
        showAllGap: round(Number.parseFloat(getComputedStyle(element).gap)
          + Number.parseFloat(getComputedStyle(showAll).marginTop)),
        showAllHeight: showAll.offsetHeight,
        brokenImages: [...document.images]
          .filter(image => !image.complete || !image.naturalWidth)
          .map(image => image.src),
      };
    });

    assert.equal(metrics.figmaNode, '1:5215');
    assert.equal(metrics.cardCount, 3);
    assert.deepEqual(metrics.ids, ['loto', 'karaoke', 'royal']);
    assert.deepEqual(metrics.tops, [0, 294, 587]);
    assert.deepEqual(metrics.sizes, [[969, 265.6], [969, 265.6], [969, 265.6]]);
    assert.deepEqual(metrics.sources, [
      '/figma-assets/purchase-loto-figma.png',
      '/figma-assets/purchase-karaoke-figma.png',
      '/figma-assets/purchase-royal-figma.png',
    ]);
    assert.ok(metrics.presentation.every(value => value.opacity === '1'
      && value.filter === 'none'
      && value.maskImage === 'none'
      && value.mixBlendMode === 'normal'
      && value.objectFit === 'fill'));
    assert.equal(metrics.showAllGap, 40);
    assert.equal(metrics.showAllHeight, 108);
    assert.deepEqual(metrics.brokenImages, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(mediaRequests, []);

    await page.screenshot({
      path: OUTPUT,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    });

    await page.getByRole('button', { name: 'Мои категории караоке-битвы' }).click();
    await page.waitForURL(url => url.hash === '#/karaoke-battle-categories');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      routeAfterKaraoke: new URL(page.url()).hash,
      screenshot: OUTPUT,
      metrics,
      pageErrors,
      mediaRequests,
    }, null, 2)}\n`);
  } finally {
    if (context) await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
