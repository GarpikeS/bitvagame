const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = String(process.env.QA_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const OUTPUT_DIR = path.resolve('artifacts/qa-music-attention-image');

async function inspectViewport(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const runtimeErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('response', (response) => {
    const isAnonymousSession = response.status() === 401 && response.url().endsWith('/api/me');
    if (response.status() >= 400 && !isAnonymousSession) {
      runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  try {
    await page.goto(`${BASE_URL}/#/music-detail`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => document.fonts.ready);

    const card = page.locator('.music-feature-card.is-attention');
    await card.waitFor({ state: 'visible' });
    await card.locator('figure img').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const image = document.querySelector('.music-feature-card.is-attention figure img');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
    const geometry = await card.locator('figure img').evaluate((image) => {
      const imageRect = image.getBoundingClientRect();
      const figureRect = image.closest('figure').getBoundingClientRect();
      return {
        figureHeight: figureRect.height,
        figureWidth: figureRect.width,
        imageHeight: imageRect.height,
        imageWidth: imageRect.width,
        leftInset: imageRect.left - figureRect.left,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        rightInset: figureRect.right - imageRect.right,
        src: image.currentSrc || image.src,
      };
    });

    assert.match(geometry.src, /\/figma-assets\/music-feature-blank-overlay\.png(?:\?|$)/);
    assert.equal(geometry.naturalWidth, 508);
    assert.equal(geometry.naturalHeight, 630);
    assert.ok(Math.abs(geometry.leftInset - geometry.rightInset) <= 0.75, JSON.stringify(geometry));
    assert.ok(geometry.imageHeight >= geometry.figureHeight * 2.04, JSON.stringify(geometry));
    assert.ok(geometry.imageHeight <= geometry.figureHeight * 2.06, JSON.stringify(geometry));
    assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));

    await card.screenshot({
      animations: 'disabled',
      path: path.join(OUTPUT_DIR, `music-attention-${width}.png`),
    });

    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      true,
      'The music detail page must not overflow horizontally',
    );
    await card.locator('.music-blanks-attention').click();
    await page.waitForFunction(() => window.location.hash === '#/music-buy-blanks');
    await page.locator('#music-buy-blanks').waitFor({ state: 'visible' });

    return geometry;
  } finally {
    await context.close();
  }
}

(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await inspectViewport(browser, 540, 960));
    results.push(await inspectViewport(browser, 390, 844));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
