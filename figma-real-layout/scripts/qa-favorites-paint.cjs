const { chromium } = require('playwright');
const fs = require('node:fs/promises');

async function main() {
  const output = 'artifacts/production-regression-20261002';
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        await context.route('**/api/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: {
          id: 'qa', name: 'Дима', balanceCoins: 650, purchasedBlanks: [], purchasedCategories: [], gameEntitlements: [],
        } }) }));
        const page = await context.newPage();
        await page.goto('https://bitvagame.ru/?audit=favorites-paint#/favorites', { waitUntil: 'domcontentloaded' });
        await page.locator('.favorites-page .game-card').first().waitFor();
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
        await page.waitForTimeout(1000);
        const facts = await page.locator('.game-card').evaluateAll(cards => cards.map(card => {
          const img = card.querySelector(':scope > img');
          const title = card.querySelector('h3');
          const help = card.querySelector('.help, .game-card-coming-help');
          const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          return { className: card.className, card: rect(card), image: rect(img), imageStyle: { height: getComputedStyle(img).height, objectFit: getComputedStyle(img).objectFit }, title: rect(title), help: rect(help) };
        }));
        await page.screenshot({ path: `${output}/favorites-settled-${width}.png` });
        await page.evaluate(() => window.scrollTo(0, 100));
        await page.waitForTimeout(200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${output}/favorites-repaint-${width}.png` });
        console.log(JSON.stringify({ width, facts }, null, 2));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
