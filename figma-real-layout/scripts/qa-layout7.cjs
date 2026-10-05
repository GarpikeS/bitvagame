const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.LAYOUT7_BASE_URL || 'http://127.0.0.1:5173';
const NAVIGATION_TIMEOUT = Number(process.env.LAYOUT7_NAVIGATION_TIMEOUT || 30_000);
const OUTPUT = process.env.LAYOUT7_OUTPUT
  ? path.resolve(process.env.LAYOUT7_OUTPUT)
  : path.resolve(__dirname, '..', 'artifacts', 'layout7-qa');

const EXPECTED_CATALOG_PACKS = Object.freeze([
  Object.freeze({
    id: 'hits-free',
    layers: Object.freeze(['/generated/layout5/category-a1.png']),
  }),
  Object.freeze({
    id: '90-1',
    layers: Object.freeze([
      '/generated/layout5/category-a2.png',
      '/generated/layout5/category-a3.png',
    ]),
  }),
  Object.freeze({
    id: '2000-1',
    layers: Object.freeze(['/generated/layout5/category-b3.png']),
  }),
  Object.freeze({
    id: '2010-1',
    layers: Object.freeze(['/figma-assets/layout7/2010-cover-clean-v2.png']),
  }),
]);

const EXPECTED_READY_COVERS = Object.freeze({
  'hits-free': '/figma-assets/music-category-karaoke-figma.png',
  '90-1': '/figma-assets/layout7/90-cover-clean.png',
  '2000-1': '/generated/layout5/category-b3.png',
  '2010-1': '/figma-assets/layout7/2010-cover-clean-v2.png',
});

const user = {
  id: 'layout7-qa',
  name: 'Тимур',
  email: 'layout7@example.test',
  balanceCoins: 11240,
  purchasedBlanks: [],
  purchasedCategories: [],
  gameEntitlements: ['karaoke:90-1'],
};

async function settle(page) {
  await page.locator('.l7-page').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.complete
      ? image.decode().catch(() => {})
      : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function open(page, route) {
  const url = new URL(BASE_URL);
  url.hash = '/' + route;
  await page.goto(url.href, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT,
  });
  await settle(page);
}

async function coldOpen(page, route) {
  await page.goto('about:blank');
  await open(page, route);
}

async function assertReadyCover(page, packId) {
  const readyStage = page.locator('.l7-pack-ready');
  await readyStage.waitFor({ state: 'visible' });
  const cover = readyStage.locator(':scope > img');
  assert.equal(await cover.count(), 1, `${packId} renders exactly one ready cover`);
  assert.equal(
    new URL(await cover.getAttribute('src'), BASE_URL).pathname,
    EXPECTED_READY_COVERS[packId],
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
}

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browserArgs = ['--mute-audio'];
  if (process.env.LAYOUT7_HOST_RESOLVER_RULES) {
    browserArgs.push('--no-proxy-server');
    browserArgs.push(`--host-resolver-rules=${process.env.LAYOUT7_HOST_RESOLVER_RULES}`);
  }
  const browser = await chromium.launch({ headless: true, args: browserArgs });
  const context = await browser.newContext({ viewport: { width: 540, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  let authenticated = true;
  let entitlementPurchaseRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('status of 401')) errors.push(message.text());
  });
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/purchases/entitlements')) {
      entitlementPurchaseRequests += 1;
    }
  });
  await page.route('**/api/me', route => route.fulfill(authenticated ? {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user }),
  } : {
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
  }));

  try {
    await open(page, 'karaoke-battle-categories');
    assert.equal(await page.locator('.l7-pack-card').count(), 4);
    assert.equal(await page.locator('.l7-pack-info-button').count(), 4);
    assert.deepEqual(
      await page.locator('.l7-pack-card').evaluateAll(cards => cards.map(card => ({
        id: card.getAttribute('data-pack-id'),
        layers: [...card.querySelectorAll('.l7-pack-artwork img')]
          .map(image => new URL(image.src).pathname),
      }))),
      EXPECTED_CATALOG_PACKS,
    );
    assert.equal(
      await page.locator([
        '.l7-pack-card[data-pack-id$="-2"]',
        '.l7-pack-card[data-pack-id$="-3"]',
        '.l7-pack-card[data-pack-id$="-4"]',
      ].join(', ')).count(),
      0,
      'retired sets 2-4 stay out of the catalog',
    );
    assert.equal(await page.locator('.l7-pack-card.is-owned').count(), 2);
    assert.equal(await page.locator('.l7-pack-card.is-free').count(), 1);
    assert.equal(await page.locator('.l7-pack-action-pill').count(), 4);
    assert.equal(
      await page.locator('.l7-pack-action-pill').evaluateAll(pills => pills.every(pill => (
        Boolean(pill.offsetWidth || pill.offsetHeight || pill.getClientRects().length)
      ))),
      true,
      'every catalog card exposes a visible action pill',
    );
    assert.deepEqual(
      await page.locator('.l7-pack-action-pill').evaluateAll(pills => pills.map(pill => (
        pill.innerText.replace(/\s+/g, ' ').trim()
      ))),
      ['Бесплатно', 'Играть', '50 монет', '50 монет'],
    );
    assert.deepEqual(
      await page.locator('.l7-pack-open').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
      [
        'Играть: Хиты караоке · бесплатная версия',
        'Играть: Хиты 90-х',
        'Купить: Хиты 2000-х',
        'Купить: Хиты 2010-х',
      ],
    );
    assert.deepEqual(
      await page.locator('.l7-pack-info-button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
      [
        'Список песен: Хиты караоке · бесплатная версия',
        'Список песен: Хиты 90-х',
        'Список песен: Хиты 2000-х',
        'Список песен: Хиты 2010-х',
      ],
    );
    assert.doesNotMatch(await page.locator('.l7-pack-grid').innerText(), /набор\s*№\s*1/i);
    assert.equal(await page.locator('.l7-page').evaluate(node => node.offsetWidth), 1080);
    await page.screenshot({ path: path.join(OUTPUT, 'catalog-540.png'), fullPage: true });

    user.gameEntitlements = ['karaoke:2000s'];
    await coldOpen(page, 'karaoke-battle-categories');
    assert.equal(await page.locator('.l7-pack-card.is-owned').count(), 2);
    assert.equal(
      await page.locator('.l7-pack-card.is-owned:not(.is-free)').getAttribute('data-pack-id'),
      '2000-1',
    );
    assert.equal(
      await page.locator('.l7-pack-card[data-pack-id="2000-1"] h3').innerText(),
      'Хиты 2000-х',
    );
    user.gameEntitlements = ['karaoke:90-1'];
    await coldOpen(page, 'karaoke-battle-categories');

    await page.locator('.l7-pack-info-button').first().click();
    assert.equal(await page.locator('.l7-pack-modal li').count(), 12);
    await settle(page);
    await page.screenshot({ path: path.join(OUTPUT, 'pack-modal-540.png'), fullPage: true });
    await page.locator('.l7-pack-modal .l7-modal-close').click();

    user.gameEntitlements = ['karaoke:90-1', 'karaoke:2000-1', 'karaoke:2010-1'];
    for (const packId of Object.keys(EXPECTED_READY_COVERS)) {
      await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
        key: 'bitva:layout7:karaoke-pack',
        value: packId,
      });
      await coldOpen(page, 'karaoke-battle-game');
      await assertReadyCover(page, packId);
      assert.equal(await page.locator('.l7-song-stage').count(), 0);
      assert.equal(await page.locator('video[aria-label^="Караоке:"]').count(), 0);
    }

    user.gameEntitlements = ['karaoke:90-1'];
    await page.evaluate(key => window.localStorage.setItem(key, '90-1'), 'bitva:layout7:karaoke-pack');
    await coldOpen(page, 'karaoke-battle-game');
    assert.equal(await page.getByText('Объявить победителя').count(), 0);
    assert.equal(await page.locator('.l7-selector').innerText(), 'ВЫБРАТЬ КАТЕГОРИЮ');
    assert.equal(await page.locator('.l7-pack-ready').count(), 1);
    await assertReadyCover(page, '90-1');
    assert.equal(await page.locator('.l7-song-stage').count(), 0);
    assert.equal(await page.locator('video[aria-label^="Караоке:"]').count(), 0);
    assert.equal((await page.locator('.l7-button--new-song').innerText()).includes('НАЧАТЬ ИГРУ'), true);
    await page.screenshot({ path: path.join(OUTPUT, 'game-cover-540.png'), fullPage: true });
    await page.locator('.l7-button--new-song').click();
    assert.equal(await page.locator('.l7-song-stage.has-video').count(), 1);
    assert.equal(await page.locator('.l7-page').evaluate(node => node.offsetHeight), 3581);
    const stageToggle = await page.locator('.l7-song-stage .l7-media-toggle').boundingBox();
    assert.ok(stageToggle && Math.abs(stageToggle.width - 78) < 1);
    await page.screenshot({ path: path.join(OUTPUT, 'game-540.png'), fullPage: true });
    const answersButton = page.locator('.l7-button--answers');
    assert.equal(await answersButton.isEnabled(), true);
    await answersButton.click();
    assert.equal(await page.locator('.l7-song-stage .l7-answer-sheet').count(), 1);
    await page.screenshot({ path: path.join(OUTPUT, 'game-answers-540.png'), fullPage: true });

    await page.locator('.l7-control-card button').nth(2).click();
    assert.equal(await page.locator('.l7-pack-ready').count(), 1, 'new game returns to the category cover');
    assert.equal(await page.locator('.l7-song-stage').count(), 0);
    await page.locator('.l7-button--new-song').click();

    await page.locator('.l7-control-card button').nth(1).click();
    await settle(page);
    assert.equal(await page.locator('.l7-song-list li').count(), 12);
    assert.deepEqual(
      await page.locator('.l7-song-list li span').allInnerTexts(),
      [
        'Мираж - Музыка нас связала',
        'Михаил Шуфутинский - 3-е Сентября',
        'Сплин - Моё сердце',
        'Алла Пугачёва - Любовь, похожая на сон',
        'Акула - Такая любовь',
        'Комбинация - Два кусочека колбаски',
        'Надежда Кадышева - Плывёт веночек',
        'Владимир Кузьмин - Я не забуду тебя',
        'Женя Белоусов - Девчонка-девчоночка',
        'Валерий Меладзе - Самба белого мотылька',
        'Владимир Маркин - Я готов целовать...',
        'Земляне - Трава у дома',
      ],
    );
    const firstSongRow = await page.locator('.l7-song-list li button').first().boundingBox();
    const wrappedSongRow = await page.locator('.l7-song-list li button').nth(3).boundingBox();
    assert.ok(firstSongRow && wrappedSongRow && wrappedSongRow.height > firstSongRow.height);
    assert.equal(await page.locator('.l7-page').evaluate(node => node.offsetHeight), 2916);
    await page.screenshot({ path: path.join(OUTPUT, 'song-list-540.png'), fullPage: true });
    await page.locator('.l7-song-list li button').first().click();
    assert.ok(await page.locator('.l7-words-modal').isVisible());
    assert.equal(await page.locator('.l7-words-modal .l7-answer-sheet').count(), 1);
    assert.equal(await page.locator('.l7-page').evaluate(node => node.offsetHeight), 2680);
    await settle(page);
    await page.screenshot({ path: path.join(OUTPUT, 'words-modal-540.png'), fullPage: true });

    user.gameEntitlements = ['karaoke:2000-2'];
    await page.evaluate(key => window.localStorage.setItem(key, '2000-2'), 'bitva:layout7:karaoke-pack');
    await coldOpen(page, 'karaoke-battle-game');
    await page.locator('.l7-control-card button').nth(1).click();
    await settle(page);
    assert.deepEqual(
      await page.locator('.l7-song-list li span').allInnerTexts(),
      [
        'Градусы - Режиссер',
        'Иракли - Лондон-Париж',
        'Лигалайз - Будущие мамы',
        '5sta Family - Я буду',
        'Надежда Кадышева - Широка река',
        'Виктория Дайнеко - Я просто сразу от тебя уйду',
        'Фабрика - Про любовь',
        'Валерий Меладзе - Океан и три реки',
        'Николай Басков - Ты далеко',
        'Стас Михайлов - Всё для тебя',
        'Бумбокс - Вахтерам',
        'Леонид Агутин, Владимир Пресняков - Аэропорты',
      ],
    );
    await page.screenshot({ path: path.join(OUTPUT, 'song-list-2000-2-540.png'), fullPage: true });

    user.gameEntitlements = [];
    await page.evaluate(key => window.localStorage.setItem(key, '2000-4'), 'bitva:layout7:karaoke-pack');
    await coldOpen(page, 'karaoke-battle-song-list');
    await page.waitForURL(/#\/karaoke-battle-song-list$/);
    assert.equal(await page.locator('.l7-song-list').count(), 1);
    assert.equal(await page.locator('.l7-song-list li').first().innerText().then(text => text.includes('IOWA - Маршрутка')), true);

    await coldOpen(page, 'karaoke-battle-categories');
    assert.equal(await page.locator('.l7-pack-card.is-owned').count(), 1);
    await page.locator('.l7-pack-card:not(.is-free) .l7-pack-open').first().click();
    assert.equal(await page.locator('.l7-purchase-modal').isVisible(), true);
    assert.match(await page.locator('.l7-purchase-modal').innerText(), /50/);
    await page.locator('.l7-purchase-modal .l7-modal-close').click();
    await page.locator('.l7-pack-card.is-free .l7-pack-open').click();
    await page.waitForURL(/#\/karaoke-battle-game$/);
    assert.equal(await page.locator('.l7-purchase-modal').count(), 0);
    assert.equal(await page.locator('.l7-pack-ready').count(), 1);
    assert.equal(await page.locator('video[aria-label^="Караоке:"]').count(), 0);
    await page.locator('.l7-button--new-song').click();
    assert.equal(await page.locator('.l7-song-stage.has-video').count(), 1);
    assert.equal(entitlementPurchaseRequests, 0);

    authenticated = false;
    await coldOpen(page, 'karaoke-battle-categories');
    assert.equal(await page.locator('.l7-pack-card.is-owned').count(), 1);
    await page.locator('.l7-pack-card.is-free .l7-pack-open').click();
    await page.waitForURL(/#\/karaoke-battle-game$/);
    assert.equal(await page.locator('.l7-pack-ready').count(), 1);
    assert.equal(await page.locator('video[aria-label^="Караоке:"]').count(), 0);
    await page.locator('.l7-button--new-song').click();
    assert.equal(await page.locator('.l7-song-stage.has-video').count(), 1);
    assert.equal(entitlementPurchaseRequests, 0);
    authenticated = true;
    user.gameEntitlements = ['karaoke:90-1'];
    await coldOpen(page, 'karaoke-battle-categories');
    await page.evaluate(key => window.localStorage.setItem(key, '90-1'), 'bitva:layout7:karaoke-pack');

    await page.setViewportSize({ width: 390, height: 844 });
    await coldOpen(page, 'karaoke-battle-categories');
    assert.equal(await page.locator('.l7-pack-card').count(), 4);
    assert.equal(
      await page.locator('body').evaluate(node => node.scrollWidth <= document.documentElement.clientWidth + 1),
      true,
    );
    await page.screenshot({ path: path.join(OUTPUT, 'catalog-390.png'), fullPage: true });

    await coldOpen(page, 'karaoke-battle-game');
    const bounds = await page.locator('.l7-page').boundingBox();
    assert.ok(bounds && Math.abs(bounds.width - 390) < 1);
    await page.screenshot({ path: path.join(OUTPUT, 'game-390.png'), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'karaoke-battle-fullscreen-landscape-hidden');
    await page.waitForURL(/#\/karaoke-battle-game$/);
    assert.equal(await page.locator('.l7-pack-ready').count(), 1, 'fullscreen deep link returns to the cover before the game starts');
    await page.locator('.l7-button--new-song').click();
    await page.locator('.l7-expand').click();
    await page.waitForURL(/#\/karaoke-battle-fullscreen-landscape-hidden$/);
    const fullscreenBounds = await page.locator('.l7-page').boundingBox();
    assert.ok(fullscreenBounds && Math.abs(fullscreenBounds.width - 1280) < 1);
    assert.equal(await page.locator('.l7-fullscreen > .l7-song-video').count(), 1);
    await page.screenshot({ path: path.join(OUTPUT, 'fullscreen-1280.png') });

    await page.locator('.l7-fullscreen-exit').click();
    await page.waitForURL(/#\/karaoke-battle-game$/);
    await page.locator('.l7-button--answers').click();
    await page.locator('.l7-expand').click();
    await page.waitForURL(/#\/karaoke-battle-fullscreen-landscape-answers$/);
    assert.equal(await page.locator('.l7-fullscreen > .l7-answer-sheet').count(), 1);
    await page.screenshot({ path: path.join(OUTPUT, 'fullscreen-answers-1280.png') });

    assert.deepEqual(errors, []);
    process.stdout.write('Layout 7 QA passed: 1 free and 3 available paid packs, retired-pack access preservation, modal lists, game controls, song list, responsive and fullscreen states.\n');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
