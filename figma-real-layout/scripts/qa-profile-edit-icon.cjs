const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.PROFILE_ICON_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(__dirname, '..', 'artifacts', 'profile-edit-icon-qa');

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let context;

  try {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    let serverName = 'Тимур';

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/api/me', async route => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        serverName = JSON.parse(request.postData() || '{}').name || serverName;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'profile-icon-qa',
            name: serverName,
            email: 'profile-icon@example.test',
            balanceCoins: 1000,
            purchasedBlanks: [],
            purchasedCategories: [],
            gameEntitlements: [],
          },
        }),
      });
    });

    await page.goto(`${BASE_URL}/#/profile`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('.profile-name input');
    const icon = page.locator('.profile-pencil-icon');
    await input.waitFor({ state: 'visible' });
    await page.evaluate(async () => document.fonts.ready);

    for (const name of ['Дима', 'Александр']) {
      await input.fill(name);
      await page.waitForTimeout(850);

      const [inputBox, iconBox] = await Promise.all([input.boundingBox(), icon.boundingBox()]);
      const iconSize = await icon.evaluate(element => {
        const style = getComputedStyle(element);
        return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
      });
      assert.ok(inputBox && iconBox, `Profile geometry is unavailable for ${name}`);
      const gap = iconBox.x - (inputBox.x + inputBox.width);
      assert.ok(gap >= 3 && gap <= 5, `Pencil gap is ${gap}px for ${name}`);
      assert.ok(Math.abs(iconSize.width - 12) <= 0.1, `Pencil width is ${iconSize.width}px for ${name}`);
      assert.ok(Math.abs(iconSize.height - 12) <= 0.1, `Pencil height is ${iconSize.height}px for ${name}`);
      assert.ok(Math.abs(iconBox.width - iconBox.height) <= 0.2, `Pencil is distorted for ${name}`);
      assert.equal(serverName, name, `Profile name was not saved for ${name}`);
      await page.locator('.profile-head').screenshot({
        path: path.join(OUTPUT, `${name === 'Дима' ? 'short' : 'regular'}-name.png`),
      });
    }

    assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
    process.stdout.write('profile_edit_icon=PASS\n');
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
