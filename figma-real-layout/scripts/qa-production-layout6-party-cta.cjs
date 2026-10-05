const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BITVA_BASE_URL || 'https://bitvagame.ru';
const OUTPUT = path.resolve(__dirname, '..', 'qa', 'production', 'royal-party-figma-cta.png');
const user = {
  id: 'production-party-visual-qa',
  name: 'Алексей',
  username: 'alexey',
  email: 'qa@example.test',
  balanceCoins: 100,
  purchasedBlanks: [],
  purchasedMusicCategories: [],
  gameEntitlements: [],
};

function json(route, payload) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-production-party-'));
  let context;
  const pageErrors = [];
  const badResponses = [];
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
        '--force-color-profile=srgb',
      ],
    });
    await context.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() { this.pause(); return Promise.resolve(); },
      });
    });
    await context.route('**/api/**', route => json(route, { user }));

    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', request => {
      if (request.resourceType() === 'media') mediaRequests.push(request.url());
    });

    await page.goto(`${BASE_URL}/?qa=${Date.now()}#/royal-battle-collection-party`, {
      waitUntil: 'domcontentloaded',
    });
    const root = page.locator('.l6c-page');
    await root.waitFor({ state: 'visible' });
    await page.waitForFunction(() => [...document.querySelectorAll('.l6c-page img')]
      .every(image => image.complete && image.naturalWidth > 0));

    const start = root.locator('.l6c-start');
    const state = await start.evaluate(node => {
      const style = getComputedStyle(node);
      const badgeStyle = getComputedStyle(node.querySelector('small'));
      return {
        renderMode: node.closest('.l6c-page')?.dataset.renderMode,
        nativeDisabled: node.disabled,
        ariaDisabled: node.getAttribute('aria-disabled'),
        title: node.querySelector('span')?.textContent.trim(),
        counter: node.querySelector('small')?.textContent.trim(),
        background: style.backgroundColor,
        color: style.color,
        badgeBackground: badgeStyle.backgroundColor,
      };
    });
    assert.deepEqual(state, {
      renderMode: 'live',
      nativeDisabled: false,
      ariaDisabled: 'true',
      title: 'Начать игру',
      counter: '10 игр',
      background: 'rgb(254, 57, 31)',
      color: 'rgb(255, 255, 255)',
      badgeBackground: 'rgb(176, 28, 8)',
    });
    assert.equal(await root.getByText('В разработке', { exact: true }).count(), 0);
    assert.equal(await root.getByText('игры скоро', { exact: true }).count(), 0);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(badResponses, []);
    assert.deepEqual(mediaRequests, []);

    const before = new URL(page.url()).hash;
    await start.evaluate(node => node.click());
    assert.equal(new URL(page.url()).hash, before);
    await root.screenshot({
      path: OUTPUT,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    });

    process.stdout.write(`${JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      route: new URL(page.url()).hash,
      screenshot: OUTPUT,
      state,
      pageErrors,
      badResponses,
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
