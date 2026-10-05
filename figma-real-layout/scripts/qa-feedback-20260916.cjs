const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const outputDir = path.resolve('artifacts/qa-feedback-20260916');

async function openRoute(page, route) {
  await page.goto(`${baseUrl}/#/${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('main.page').first().waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.race([
      Promise.all([...document.images].map(image => image.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 10000)),
    ]);
  });
}

async function textLineTops(locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()]
      .map((rect) => Math.round(rect.top * 10) / 10)
      .filter((top, index, values) => index === 0 || top !== values[index - 1]);
  });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
    const page = await context.newPage();

    await openRoute(page, '');
    const filterLabels = await page.locator('.filters .filter').allTextContents();
    assert.deepEqual(filterLabels, ['Бесплатно', 'Без реквизита']);
    const allGameCount = await page.locator('.game-grid .game-card').count();
    await page.getByRole('button', { name: 'Бесплатно' }).click();
    assert.ok(await page.getByRole('button', { name: 'Бесплатно' }).getAttribute('class').then((value) => value?.includes('active')));
    await page.getByRole('button', { name: 'Бесплатно' }).click();
    assert.equal(await page.locator('.game-grid .game-card').count(), allGameCount);
    const heroLineTops = await textLineTops(page.locator('.hero-copy p'));
    await page.locator('.hero-section').screenshot({ path: path.join(outputDir, 'home-hero.png') });

    await openRoute(page, 'game-detail');
    const mafiaNav = page.locator('.detail-hero > .detail-nav');
    await assert.doesNotReject(() => mafiaNav.waitFor({ state: 'visible' }));
    await expectClass(mafiaNav, 'new-detail-nav');
    const loginStyle = await mafiaNav.locator('.close-user').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        color: style.color,
        height: element.getBoundingClientRect().height,
      };
    });
    assert.equal(loginStyle.backgroundColor, 'rgb(254, 57, 31)');
    assert.equal(loginStyle.color, 'rgb(255, 255, 255)');
    assert.ok(loginStyle.height >= 41.5, `Mafia login height is ${loginStyle.height}px`);
    await page.locator('.detail-hero').screenshot({ path: path.join(outputDir, 'mafia-hero.png') });

    await openRoute(page, 'music-detail');
    const attention = page.locator('.music-feature-card.is-attention');
    const attentionGaps = await attention.evaluate((card) => {
      const figure = card.querySelector('figure').getBoundingClientRect();
      const copy = card.querySelector('.music-feature-copy').getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      return {
        copyLeft: copy.left - bounds.left,
        copyRight: bounds.right - copy.right,
        figureLeft: figure.left - bounds.left,
        figureRight: bounds.right - figure.right,
      };
    });
    assert.ok(Math.abs(attentionGaps.figureLeft - attentionGaps.figureRight) <= 0.5, JSON.stringify(attentionGaps));
    assert.ok(Math.abs(attentionGaps.copyLeft - attentionGaps.copyRight) <= 0.5, JSON.stringify(attentionGaps));
    await attention.screenshot({ path: path.join(outputDir, 'music-attention.png') });

    console.log(JSON.stringify({ attentionGaps, filterLabels, heroLineCount: heroLineTops.length, heroLineTops, loginStyle }, null, 2));
    await context.close();

    const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const narrowPage = await narrowContext.newPage();

    await openRoute(narrowPage, '');
    assert.equal((await textLineTops(narrowPage.locator('.hero-copy p'))).length, 5);
    assert.deepEqual(await narrowPage.locator('.filters .filter').allTextContents(), ['Бесплатно', 'Без реквизита']);
    await assertNoHorizontalOverflow(narrowPage);

    await openRoute(narrowPage, 'game-detail');
    assert.equal(
      await narrowPage.locator('.detail-hero .close-user').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(254, 57, 31)',
    );
    await assertNoHorizontalOverflow(narrowPage);

    await openRoute(narrowPage, 'music-detail');
    await assertNoHorizontalOverflow(narrowPage);
    await narrowPage.screenshot({ path: path.join(outputDir, 'mobile-390.png'), fullPage: true });
    await narrowContext.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function expectClass(locator, className) {
  const classes = await locator.getAttribute('class');
  assert.ok(classes?.split(/\s+/).includes(className), `Expected class ${className}, got ${classes}`);
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `Horizontal overflow is ${overflow}px`);
}
