const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.QA_BASE_URL || 'https://bitvagame.ru';
const OUTPUT = path.resolve('artifacts/production-regression-20261002');
const USER = {
  id: 'regression-qa', name: 'Дима', email: 'regression@example.test', balanceCoins: 650,
  purchasedBlanks: [{ id: 'qa-blanks', category: 'Девичник', count: 5 }],
  purchasedCategories: ['Девичник'],
  gameEntitlements: ['karaoke:90-1', 'karaoke:2000-1', 'karaoke:2010-1'],
};
const CASES = [
  ['guest', ''], ['guest', 'music-detail'], ['guest', 'game-detail'],
  ['guest', 'karaoke-battle'], ['guest', 'login'], ['guest', 'privacy'],
  ['member', ''], ['member', 'profile'], ['member', 'favorites'],
  ['member', 'purchases'], ['member', 'karaoke-battle-categories'],
  ['member', 'karaoke-battle-game'],
];

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const report = { url: BASE_URL, checkedAt: new Date().toISOString(), cases: [], issues: [] };
  try {
    for (const width of [390, 1280]) {
      for (const [state, routeName] of CASES) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.status() >= 400 && !(response.status() === 401 && new URL(response.url()).pathname === '/api/me')) {
            errors.push(`HTTP ${response.status()}: ${response.url()}`);
          }
        });
        page.on('requestfailed', request => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
        await context.route('**/api/**', requestRoute => {
          const request = requestRoute.request();
          if (new URL(request.url()).pathname === '/api/me' && request.method() === 'GET') {
            return requestRoute.fulfill({ status: state === 'member' ? 200 : 401, contentType: 'application/json',
              body: JSON.stringify(state === 'member' ? { user: USER } : { error: 'UNAUTHENTICATED' }) });
          }
          if (!['GET', 'HEAD'].includes(request.method())) return requestRoute.abort('blockedbyclient');
          return requestRoute.continue();
        });
        try {
          await page.goto(`${BASE_URL}/?audit=regression-${width}-${state}-${routeName || 'home'}#/${routeName}`, {
            waitUntil: 'domcontentloaded', timeout: 30000,
          });
          await page.locator('main.page').first().waitFor({ state: 'visible', timeout: 15000 });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.race([
              Promise.all([...document.images].map(image => image.decode().catch(() => {}))),
              new Promise(resolve => setTimeout(resolve, 10000)),
            ]);
          });
          const facts = await page.evaluate(() => {
            const root = document.querySelector('main.page');
            const bounds = root.getBoundingClientRect();
            const header = root.querySelector('.topbar, .detail-nav, .profile-nav, .l5x-purchase-nav');
            const headerBounds = header?.getBoundingClientRect();
            return {
              hash: location.hash,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              page: { left: bounds.left, right: bounds.right, width: bounds.width },
              header: headerBounds ? { left: headerBounds.left, right: headerBounds.right, width: headerBounds.width } : null,
              brokenImages: [...root.querySelectorAll('img')].filter(image => image.complete && image.naturalWidth === 0)
                .map(image => image.getAttribute('src')),
            };
          });
          assert.ok(facts.overflow <= 1, `Horizontal overflow: ${facts.overflow}`);
          assert.ok(facts.page.left >= -1 && facts.page.right <= width + 1, 'Page extends beyond viewport');
          if (facts.header) {
            assert.ok(facts.header.width > 0, 'Header has no size');
            assert.ok(facts.header.left >= facts.page.left - 1 && facts.header.right <= facts.page.right + 1,
              'Header extends beyond page');
          }
          assert.deepEqual(facts.brokenImages, [], 'Broken images');
          assert.deepEqual(errors, [], 'Runtime/network errors');
          await page.screenshot({ path: path.join(OUTPUT, `${state}-${routeName || 'home'}-${width}.png`), animations: 'disabled' });
          report.cases.push({ state, route: routeName || 'home', width, status: 'PASS', ...facts });
        } catch (error) {
          const issue = { state, route: routeName || 'home', width, message: error.message, errors };
          report.issues.push(issue);
          await page.screenshot({ path: path.join(OUTPUT, `failure-${state}-${routeName || 'home'}-${width}.png`) }).catch(() => {});
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  await fs.writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.cases.length, issues: report.issues }, null, 2));
  if (report.issues.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
