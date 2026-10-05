const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';

async function waitForApp(page) {
  await page.waitForSelector('.app-shell');
  await page.waitForTimeout(150);
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitForApp(page);
}

(async () => {
  let browser;
  const errors = [];

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('/api/me')) {
        errors.push(`response: ${response.status()} ${response.url()}`);
      }
    });
    page.on('requestfailed', request => {
      if (!request.url().includes('/api/me')) {
        errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`);
      }
    });

    await open(page, `${baseUrl}/#/`);
    const karaokeCard = page.locator('.game-card.is-karaoke');
    assert.ok(!(await karaokeCard.getAttribute('class')).includes('is-coming-soon'),
      'The Karaoke card on Home must be unlocked');
    await karaokeCard.locator('.game-card-hitbox').click();
    await page.waitForURL(/#\/karaoke-battle$/);
    await page.getByRole('heading', { name: 'КАРАОКЕ-БИТВА', exact: true }).waitFor();

    await open(page, `${baseUrl}/#/karaoke-battle`);
    await page.getByRole('heading', { name: 'КАРАОКЕ-БИТВА', exact: true }).waitFor();

    await page.getByRole('button', { name: 'Показать все категории', exact: true }).click();
    await page.locator('.l7-catalog').waitFor();
    assert.equal(new URL(page.url()).hash, '#/karaoke-battle-categories');

    await open(page, `${baseUrl}/#/karaoke-battle-game`);
    await page.locator('.l7-game').waitFor();
    assert.equal(new URL(page.url()).hash, '#/karaoke-battle-game',
      'A normal deep Karaoke URL must stay open');

    await open(page, `${baseUrl}/#/royal-battle`);
    assert.equal(await page.getByRole('heading', { name: 'КОРОЛЕВСКАЯ БИТВА', exact: true }).count(), 0,
      'Royal Battle must remain closed');

    assert.deepEqual(errors, []);
    console.log('karaoke_public_link=PASS');
  } finally {
    await browser?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
