const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const CASES = [
  { name: 'register-1', route: 'auth-register-success', intent: 'purchase', payment: 'blanks', node: '1:3902' },
  { name: 'register-2', route: 'auth-register-success', intent: 'category-purchase', payment: 'karaoke-90s', node: '1:4057' },
  { name: 'register-3', route: 'auth-register-success', intent: 'default', payment: 'blanks', node: '1:4303' },
  { name: 'login-1', route: 'auth-login-success', intent: 'purchase', payment: 'blanks', node: '1:4212' },
  { name: 'login-2', route: 'auth-login-success', intent: 'default', payment: 'blanks', node: '1:4235' },
  { name: 'login-3', route: 'auth-login-success', intent: 'play', payment: 'blanks', node: '1:4258' },
  { name: 'login-4', route: 'auth-login-success', intent: 'category-purchase', payment: 'karaoke-90s', node: '1:4281' },
];

function exactPixelDifference(reference, actual) {
  const result = spawnSync('magick', ['compare', '-metric', 'AE', reference, actual, 'null:'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stderr || ''}${result.stdout || ''}`.trim();
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) throw new Error(`ImageMagick compare failed (${result.status}): ${output}`);
  const value = Number.parseFloat(output);
  if (!Number.isFinite(value)) throw new Error(`Unexpected ImageMagick metric: ${output}`);
  return value;
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa', 'layout5-auth-exact');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-layout5-auth-qa-'));
  const { createServer } = await import('vite');
  let server;
  let context;
  const errors = [];
  const reports = [];

  try {
    await fs.mkdir(output, { recursive: true });
    server = await createServer({ root, server: { host: '127.0.0.1', port: 5201, strictPort: true } });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: 1080, height: 900 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking', '--autoplay-policy=user-gesture-required'],
    });
    await context.addInitScript(() => {
      const query = new URLSearchParams(location.search);
      if (query.has('authIntent')) localStorage.setItem('bitva_auth_intent', query.get('authIntent'));
      if (query.has('paymentIntent')) localStorage.setItem('bitva_payment_intent', query.get('paymentIntent'));
      localStorage.setItem('bitva_logged_in', '1');
    });
    await context.route('**/api/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        user: {
          id: 'layout5-auth-qa',
          name: 'Тимур',
          email: 'qa@example.test',
          balanceCoins: 11240,
          purchasedBlanks: [],
          purchasedCategories: [],
          gameEntitlements: ['karaoke:girls', 'royal:all'],
        },
      }),
    }));

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    for (const item of CASES) {
      const query = new URLSearchParams({ authIntent: item.intent, paymentIntent: item.payment, qa: item.name });
      await page.goto(`http://127.0.0.1:5201/?${query}#/${item.route}`, { waitUntil: 'networkidle' });
      const rootPage = page.locator('.l5a-page');
      await rootPage.waitFor({ state: 'visible' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      await rootPage.evaluate(element => element.style.setProperty('--canvas-target-width', '1080px'));
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForFunction(() => document.querySelector('.responsive-canvas')?.dataset.scaled === 'false');

      const metrics = await rootPage.evaluate(element => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
        node: element.dataset.figmaNode,
        renderMode: element.dataset.renderMode,
        missingImages: [...element.querySelectorAll('img')]
          .filter(image => !image.complete || !image.naturalWidth)
          .map(image => image.getAttribute('src')),
      }));
      assert.deepEqual(metrics, {
        width: 1080,
        height: 2564,
        node: item.node,
        renderMode: 'figma-reference',
        missingImages: [],
      });

      const actual = path.join(output, `${item.name}.png`);
      const reference = path.join(root, 'public', 'generated', 'layout5', 'auth-states', `${item.name}.png`);
      await rootPage.screenshot({ path: actual });
      const changedPixels = exactPixelDifference(reference, actual);
      assert.equal(changedPixels, 0, `${item.name}: ${changedPixels} changed pixels`);
      reports.push({ ...item, changedPixels });
    }

    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), errors, reports }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', screens: reports.length, changedPixels: reports.reduce((sum, item) => sum + item.changedPixels, 0), errors }));
  } finally {
    await context?.close();
    await server?.close();
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('bitva-layout5-auth-qa-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
