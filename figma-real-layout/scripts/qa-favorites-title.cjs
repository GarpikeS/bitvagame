const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.env.QA_FAVORITES_OUTPUT || 'artifacts/favorites-title-local');
const USER = { id: 'qa', name: 'Дима', balanceCoins: 650, purchasedBlanks: [], purchasedCategories: [], gameEntitlements: [] };

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  await page.evaluate(() => window.scrollTo(0, 100));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const width of [320, 375, 390, 540, 768, 1280]) {
      for (const favorites of [['musical', 'mafia', 'royal', 'karaoke'], ['mafia']]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
          await context.addInitScript(ids => localStorage.setItem('bitva_favorites', JSON.stringify(ids)), favorites);
          await context.route('**/api/**', route => {
            if (new URL(route.request().url()).pathname === '/api/me') {
              return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: USER }) });
            }
            return ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(`${BASE}/#/favorites`, { waitUntil: 'domcontentloaded' });
          const card = page.locator('.favorites-page .game-card.is-mafia');
          await card.waitFor();
          await settle(page);
          const facts = await card.evaluate(element => {
            const title = element.querySelector('h3');
            const help = element.querySelector('.help');
            const range = document.createRange();
            range.selectNodeContents(title);
            const box = item => { const r = item.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
            return { title: box(title), help: box(help), lines: [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
              titleText: title.textContent.replaceAll('\u00ad', ''), overflow: document.documentElement.scrollWidth - innerWidth };
          });
          assert.equal(facts.titleText, 'Распределитель ролей в мафии');
          assert.ok(facts.overflow <= 1, 'No horizontal page overflow');
          for (const line of facts.lines) {
            assert.ok(line.right <= facts.title.right + 1, `Text exceeds heading width: ${JSON.stringify(facts)}`);
            if (line.top < facts.help.bottom && line.bottom > facts.help.top) {
              assert.ok(line.right < facts.help.left - 1, 'Title overlaps question icon');
            }
          }
          assert.equal(await card.locator('.help').count(), 1);
          await page.screenshot({ path: path.join(OUTPUT, `favorites-${favorites.length}-${width}.png`) });
          await card.locator('.help').click();
          await page.waitForURL(/#\/game-detail$/);
          await page.goto(`${BASE}/#/favorites`, { waitUntil: 'domcontentloaded' });
          await card.waitFor();
          await card.locator('.like').click();
          await card.waitFor({ state: 'detached' });
          assert.deepEqual(errors, []);
          report.push({ width, favorites: favorites.length, status: 'PASS', ...facts });
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Favorites title QA passed: ${report.length} cases; full text, no icon overlap, help and favorite actions.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
