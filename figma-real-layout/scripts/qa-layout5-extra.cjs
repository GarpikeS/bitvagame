const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromium } = require('playwright');

const runFile = promisify(execFile);
const MAGICK = 'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe';
const screens = [
  ['viewed-songs', 'karaoke-battle-viewed-songs', 'viewed-songs.png', 1080, 3581],
  ['song-list', 'karaoke-battle-song-list', 'song-list-modal.png', 1080, 2680],
  ['purchases', 'karaoke-battle-purchases', 'purchases.png', 1080, 2241],
  ['portrait-hidden', 'karaoke-battle-fullscreen-portrait-hidden', 'fullscreen-portrait-hidden.png', 1080, 1891],
  ['portrait-answers', 'karaoke-battle-fullscreen-portrait-answers', 'fullscreen-portrait-answers.png', 1080, 1891],
  ['landscape-hidden', 'karaoke-battle-fullscreen-landscape-hidden', 'fullscreen-landscape-hidden.png', 1280, 800],
  ['landscape-answers', 'karaoke-battle-fullscreen-landscape-answers', 'fullscreen-landscape-answers.png', 1280, 800],
];

async function exactPixelDifference(reference, actual) {
  const parseMetric = value => {
    const match = String(value || '').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
    return match ? Number(match[0]) : Number.NaN;
  };
  try {
    const result = await runFile(MAGICK, ['compare', '-metric', 'AE', reference, actual, 'null:']);
    return parseMetric(result.stderr || result.stdout || '0');
  } catch (error) {
    const metric = parseMetric(error.stderr || error.stdout);
    if (Number.isFinite(metric)) return metric;
    throw error;
  }
}

async function normalizedRmse(reference, actual) {
  const parseMetric = value => {
    const match = String(value || '').match(/\((\d+(?:\.\d+)?)\)/);
    return match ? Number(match[1]) : Number.NaN;
  };
  try {
    const result = await runFile(MAGICK, ['compare', '-metric', 'RMSE', reference, actual, 'null:']);
    return parseMetric(result.stderr || result.stdout || '0');
  } catch (error) {
    const metric = parseMetric(error.stderr || error.stdout);
    if (Number.isFinite(metric)) return metric;
    throw error;
  }
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(80);
}

async function exercise(page, name) {
  if (name === 'viewed-songs') {
    const listMetrics = await page.locator('.l5x-viewed-live-list').evaluate(element => ({
      count: element.dataset.playedCount,
      cards: element.querySelectorAll('.l5x-viewed-live-card').length,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    assert.equal(listMetrics.count, '5');
    assert.equal(listMetrics.cards, 5);
    assert.ok(listMetrics.scrollHeight > listMetrics.clientHeight);
    await page.getByRole('button', { name: /Открыть выпавшую песню 1:/ }).click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'song:0');
  } else if (name === 'song-list') {
    await page.getByRole('button', { name: 'Закрыть список песен' }).first().click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'close');
  } else if (name === 'purchases') {
    await page.getByRole('button', { name: 'Мои категории караоке-битвы' }).click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'go:karaoke-battle-categories');
  } else {
    await page.getByRole('button', { name: 'Новая песня' }).click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'new-song');
    await page.getByRole('button', { name: 'Пауза' }).click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'pause');
    await page.getByRole('button', { name: 'Выйти из полноэкранного режима' }).click();
    assert.equal(await page.locator('body').getAttribute('data-last-action'), 'exit');
  }
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa', 'layout5-extra');
  const assets = path.join(root, 'public', 'generated', 'layout5', 'extra-screens');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-layout5-extra-qa-'));
  await fs.mkdir(output, { recursive: true });
  const { createServer } = await import('vite');
  const report = {};
  const requests = [];
  const pageErrors = [];
  let server;
  let context;
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port: 5205, strictPort: true } });
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      args: ['--mute-audio', '--no-first-run', '--disable-background-networking'],
    });
    await context.addInitScript(() => {
      localStorage.setItem('bitva_music_category', 'Девичник');
      localStorage.setItem('bitva_music_song_index', '37');
      localStorage.setItem('bitva:layout5:karaoke-category', 'hits');
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => requests.push(request.url()));

    for (const [name, route, file, width, height] of screens) {
      await page.setViewportSize({ width, height: Math.min(height, 1000) });
      await page.goto('http://127.0.0.1:5205/qa/layout5-extra-harness.html?screen=' + encodeURIComponent(route) + '#/' + route, { waitUntil: 'networkidle' });
      await settle(page);
      const rootLocator = page.locator('.l5x-page');
      const metrics = await rootLocator.evaluate(element => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
        node: element.dataset.figmaNode,
        missing: [...element.querySelectorAll('img')]
          .filter(image => !image.complete || !image.naturalWidth)
          .map(image => image.getAttribute('src')),
        audioElements: element.querySelectorAll('audio').length,
        semanticHeadings: element.querySelectorAll('h1').length,
      }));
      assert.equal(metrics.width, width);
      assert.equal(metrics.height, height);
      assert.deepEqual(metrics.missing, []);
      assert.equal(metrics.audioElements, 0);
      assert.ok(metrics.semanticHeadings > 0);
      assert.deepEqual(await page.evaluate(() => ({
        legacyCategory: localStorage.getItem('bitva_music_category'),
        legacyIndex: localStorage.getItem('bitva_music_song_index'),
        layout5Category: localStorage.getItem('bitva:layout5:karaoke-category'),
      })), {
        legacyCategory: 'Девичник',
        legacyIndex: '37',
        layout5Category: 'hits',
      });

      const screenshot = path.join(output, name + '.png');
      await rootLocator.screenshot({ path: screenshot });
      const reference = path.join(assets, file);
      const changedPixels = await exactPixelDifference(reference, screenshot);
      const rmse = await normalizedRmse(reference, screenshot);
      if (name === 'purchases') {
        assert.ok(changedPixels < 410000, 'live purchase cards exceed the Figma pixel-diff budget');
        assert.ok(rmse < 0.025, 'live purchase cards exceed the Figma RMSE budget');
      } else if (name !== 'viewed-songs') {
        assert.equal(changedPixels, 0, name + ' differs from the exact Figma export');
      } else {
        assert.ok(changedPixels > 0, 'viewed-songs must replace the static Figma fixture with live history');
      }
      await exercise(page, name);
      report[name] = { route, width, height, figmaNode: metrics.node, changedPixels, normalizedRmse: rmse };
    }

    const forbiddenRequests = requests.filter(url => /yandex|\\.mp3(?:\\?|$)|\\.wav(?:\\?|$)|audio/i.test(url));
    assert.deepEqual(forbiddenRequests, []);
    assert.deepEqual(pageErrors, []);
    const result = { checkedAt: new Date().toISOString(), pageErrors, forbiddenRequests, screens: report };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: 'PASS', ...result }));
  } finally {
    await context?.close();
    await server?.close();
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('bitva-layout5-extra-qa-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
