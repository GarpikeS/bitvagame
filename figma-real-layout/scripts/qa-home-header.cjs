const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.HOME_HEADER_BASE_URL || 'http://127.0.0.1:5173';
const OUTPUT = path.resolve(__dirname, '..', 'artifacts', 'home-header-qa');

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let context;

  try {
    context = await browser.newContext({
      viewport: { width: 540, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/api/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'home-header-qa',
          name: 'Борис',
          email: 'home-header@example.test',
          balanceCoins: 800,
          purchasedBlanks: [],
          purchasedCategories: [],
          gameEntitlements: [],
        },
      }),
    }));

    await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
    const header = page.locator('.home-page.is-logged-in .topbar');
    const brand = header.locator('.brand');
    const account = header.locator('.account-pill');
    await header.waitFor({ state: 'visible' });
    await page.evaluate(async () => document.fonts.ready);

    const [headerBox, brandBox, accountBox] = await Promise.all([
      header.boundingBox(),
      brand.boundingBox(),
      account.boundingBox(),
    ]);
    assert.ok(headerBox && brandBox && accountBox, 'Header geometry is unavailable');
    assert.ok(brandBox.x < accountBox.x, 'Account controls must follow the logo');

    const rightInset = headerBox.x + headerBox.width - accountBox.x - accountBox.width;
    assert.ok(Math.abs(rightInset - 10) <= 1, `Account controls are not right-aligned: ${rightInset}px`);
    assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);

    await header.screenshot({ path: path.join(OUTPUT, 'header-540.png') });
    process.stdout.write(`${JSON.stringify({ rightInset, headerBox, brandBox, accountBox }, null, 2)}\n`);
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
