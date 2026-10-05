const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/';
const OUT_DIR = path.resolve(ROOT, process.env.QA_OUT_DIR || 'qa/layout4-typography');
const WIDTH = Number(process.env.QA_WIDTH || 540);
const HEIGHT = Number(process.env.QA_HEIGHT || 900);
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const CHROME_PATH = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));

const targets = [
  ['intro heading', '.karaoke-detail-intro h1'],
  ['intro body', '.karaoke-detail-intro p'],
  ['feature body', '.karaoke-feature-grid article:first-child'],
  ['start button', '.karaoke-detail-start'],
  ['rules heading', '.karaoke-rules-card h2'],
  ['rules body', '.karaoke-rules-card li:first-child p'],
  ['rules emphasis', '.karaoke-rules-card li:first-child strong'],
  ['rules number', '.karaoke-rules-card li:first-child > span'],
  ['requisite heading', '.karaoke-requisite-card h2'],
  ['requisite lead', '.karaoke-requisite-card p span:first-child'],
  ['requisite body', '.karaoke-requisite-card p span:last-child'],
  ['score heading', '.karaoke-score-section h2'],
  ['score value', '.karaoke-score-grid > span:first-child b'],
  ['score caption', '.karaoke-score-grid > span:first-child small'],
  ['category heading', '.karaoke-detail-categories > h2'],
  ['recommend heading', '.karaoke-recommendations > h2'],
  ['show all categories', '.karaoke-detail-categories .show-all'],
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!CHROME_PATH) throw new Error('Chrome/Edge executable not found.');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--mute-audio'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
      });
    });
    await page.goto(`${BASE_URL}#/karaoke-detail`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => document.fonts.ready);

    const metrics = await page.evaluate((entries) => entries.map(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!element) return { name, selector, missing: true };
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        name,
        selector,
        text: element.textContent.trim().replace(/\s+/g, ' '),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        fontStretch: style.fontStretch,
        transform: style.transform,
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    }), targets);

    const fontChecks = await page.evaluate(() => {
      const checks = {};
      for (const weight of [400, 500, 600, 700, 800, 900]) {
        checks[`ui-${weight}`] = document.fonts.check(`${weight} 16px "Bitva UI Fallback"`);
      }
      for (const weight of [700, 800, 900]) {
        checks[`display-${weight}`] = document.fonts.check(`${weight} 48px "Bitva Display Fallback"`);
      }
      return checks;
    });

    const clips = [
      ['intro', '.karaoke-detail-intro'],
      ['rules', '.karaoke-rules-card'],
      ['requisite', '.karaoke-requisite-card'],
      ['score', '.karaoke-score-section'],
      ['recommendations', '.karaoke-recommendations'],
    ];
    for (const [name, selector] of clips) {
      const locator = page.locator(selector);
      if (await locator.count()) {
        await locator.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
      }
    }

    const report = {
      baseUrl: BASE_URL,
      viewport: { width: WIDTH, height: HEIGHT },
      fontChecks,
      metrics,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
