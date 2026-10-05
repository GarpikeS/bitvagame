const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromium } = require('playwright');

const execFileAsync = promisify(execFile);
const BASE_URL = String(process.env.BITVA_BASE_URL || 'http://127.0.0.1:5175').replace(/\/$/, '');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SUPPORT_URL = 'https://t.me/bitva_org';
const CLOSED_GAME_ROUTES = Object.freeze([
  'royal-battle',
  'royal-battle-collections',
  'royal-battle-collection-birthday',
  'royal-battle-collection-confirm',
  'royal-battle-game',
  'royal-battle-info-birthday',
  'royal-battle-obsolete-bookmark',
]);

const fullUser = Object.freeze({
  id: 'qa-pravki2-user',
  email: 'qa-pravki2@example.test',
  name: 'Тимур',
  balanceCoins: 11240,
  purchasedBlanks: [{ id: 'qa-blank-pack', category: 'Девичник', count: 5, createdAt: '2026-09-15T00:00:00.000Z' }],
  purchasedCategories: ['Девичник'],
  gameEntitlements: ['karaoke:90s', 'royal:birthday'],
});

const emptyUser = Object.freeze({
  ...fullUser,
  purchasedBlanks: [],
  purchasedCategories: [],
  gameEntitlements: [],
});

function routeUrl(route = '') {
  return `${BASE_URL}/${route ? `#/${route}` : '#/'}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function settle(page, rootSelector = 'main.page') {
  await page.locator(rootSelector).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(120);
}

async function openRoute(page, route = '') {
  await page.goto(routeUrl(route), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page);
}

async function screenshot(page, output, name, options = {}) {
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: options.fullPage !== false,
    animations: 'disabled',
  });
}

async function assertElementIsNotClipped(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const metrics = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clippingAncestors = [];
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX);
      const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY);
      if (clipsX || clipsY) {
        const parentRect = ancestor.getBoundingClientRect();
        if ((clipsX && (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1))
          || (clipsY && (rect.top < parentRect.top - 1 || rect.bottom > parentRect.bottom + 1))) {
          clippingAncestors.push({
            className: ancestor.className,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            parent: { left: parentRect.left, top: parentRect.top, right: parentRect.right, bottom: parentRect.bottom },
          });
        }
      }
      ancestor = ancestor.parentElement;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      textRect: { left: textRect.left, top: textRect.top, right: textRect.right, bottom: textRect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      clippingAncestors,
      centerIsTarget: center === element || element.contains(center),
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      opacity: getComputedStyle(element).opacity,
    };
  });

  assert.ok(metrics.rect.width > 20 && metrics.rect.height > 20, `${label}: CTA has no rendered size`);
  assert.ok(metrics.rect.left >= -1 && metrics.rect.right <= metrics.viewport.width + 1, `${label}: CTA exceeds viewport horizontally`);
  assert.ok(metrics.rect.top >= -1 && metrics.rect.bottom <= metrics.viewport.height + 1, `${label}: CTA cannot be fully scrolled into view`);
  assert.deepEqual(metrics.clippingAncestors, [], `${label}: CTA is clipped by an overflow ancestor`);
  assert.ok(metrics.textRect.left >= metrics.rect.left - 1 && metrics.textRect.right <= metrics.rect.right + 1, `${label}: CTA text is clipped horizontally`);
  assert.ok(metrics.textRect.top >= metrics.rect.top - 1 && metrics.textRect.bottom <= metrics.rect.bottom + 1, `${label}: CTA text is clipped vertically`);
  assert.equal(metrics.centerIsTarget, true, `${label}: CTA center is covered by another element`);
  assert.notEqual(metrics.display, 'none', `${label}: CTA is display:none`);
  assert.notEqual(metrics.visibility, 'hidden', `${label}: CTA is visibility:hidden`);
  assert.notEqual(Number(metrics.opacity), 0, `${label}: CTA is transparent`);
  return metrics;
}

async function profileProcessIds(profile) {
  if (process.platform !== 'win32') return [];
  const script = [
    '$needle = $env:BITVA_QA_PROFILE',
    '$ids = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } | Select-Object -ExpandProperty ProcessId',
    '$ids -join ","',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], {
    env: { ...process.env, BITVA_QA_PROFILE: profile },
    windowsHide: true,
  });
  return String(stdout || '').trim().split(',').filter(Boolean).map(Number).filter(Number.isFinite);
}

async function ensureProfileProcessesClosed(profile) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const ids = await profileProcessIds(profile);
    if (!ids.length) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const ids = await profileProcessIds(profile);
  if (ids.length && process.platform === 'win32') {
    const script = '$ids = $env:BITVA_QA_PIDS -split ","; Get-Process -Id $ids -ErrorAction SilentlyContinue | Stop-Process -Force';
    await execFileAsync('powershell', ['-NoProfile', '-Command', script], {
      env: { ...process.env, BITVA_QA_PIDS: ids.join(',') },
      windowsHide: true,
    }).catch(() => {});
  }
  assert.deepEqual(await profileProcessIds(profile), [], 'Chrome processes using the dedicated QA profile are still running');
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa', 'pravki2');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bitva-pravki2-qa-'));
  const report = { checkedAt: new Date().toISOString(), baseUrl: BASE_URL, checks: {}, viewports: {} };
  const pageErrors = [];
  let sessionUser = fullUser;
  let context;

  await fs.mkdir(output, { recursive: true });
  try {
    const response = await fetch(BASE_URL, { redirect: 'manual' }).catch((error) => {
      throw new Error(`Bitva local site is not reachable at ${BASE_URL}: ${error.message}`);
    });
    assert.ok(response.status >= 200 && response.status < 500, `Unexpected local site response: ${response.status}`);

    context = await chromium.launchPersistentContext(profile, {
      executablePath: CHROME_PATH,
      headless: true,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      args: [
        '--mute-audio',
        '--no-first-run',
        '--disable-background-networking',
        '--disable-component-update',
      ],
    });

    await context.addInitScript(() => {
      localStorage.setItem('bitva_logged_in', '1');
      localStorage.setItem('bitva_name', 'Тимур');
      localStorage.setItem('bitva_balance', '11240');
      localStorage.setItem('bitva_music_category', 'Девичник');
      localStorage.setItem('bitva_music_song_index', '32');
      localStorage.setItem('bitva_music_played_indexes', JSON.stringify([1, 32]));
      localStorage.setItem('bitva_music_show_category_cover', '0');
      localStorage.setItem('bitva_favorites', JSON.stringify(['musical', 'mafia']));
    });

    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/me' && request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionUser }) });
        return;
      }
      if (pathname === '/api/me' && request.method() === 'PATCH') {
        const body = request.postDataJSON();
        sessionUser = { ...sessionUser, name: body.name || sessionUser.name };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionUser }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, user: sessionUser }) });
    });
    await context.route('https://t.me/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Telegram support QA</title>',
    }));
    await context.route('https://cloud-api.yandex.net/**', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'disabled during deterministic UI QA' }),
    }));

    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => pageErrors.push({ url: page.url(), message: error.message }));

    // Home: search and both obsolete all-games controls are removed.
    await openRoute(page);
    const home = page.locator('.home-page');
    assert.equal(await home.locator('.search, [role="search"], input[type="search"]').count(), 0, 'Home search must be removed');
    assert.equal(await home.getByRole('button', { name: 'Все игры', exact: true }).count(), 0, 'The upper «Все игры» filter must be removed');
    assert.equal(await home.getByRole('button', { name: 'Показать все игры', exact: true }).count(), 0, 'The lower «Показать все игры» must be removed');

    const priceLinks = home.locator('a.feature-blank-option');
    assert.equal(await priceLinks.count(), 2, 'Both blank price cards must be links');
    for (let index = 0; index < 2; index += 1) {
      assert.equal(await priceLinks.nth(index).getAttribute('href'), '#/music-buy-blanks');
    }
    const royalCard = home.locator('.game-card.is-royal');
    assert.ok((await royalCard.getAttribute('class')).includes('is-coming-soon'), 'royal must be locked');
    assert.equal(await royalCard.locator('.game-card-hitbox, .play-card, button').count(), 0, 'royal must not have an active play/info control');
    assert.match(normalizeText(await royalCard.textContent()), /в разработке/i);

    const karaokeCard = home.locator('.game-card.is-karaoke');
    assert.ok(!(await karaokeCard.getAttribute('class')).includes('is-coming-soon'), 'karaoke must be open');
    assert.equal(await karaokeCard.locator('.game-card-hitbox').count(), 1, 'karaoke must have an active play control');
    assert.doesNotMatch(normalizeText(await karaokeCard.textContent()), /в разработке/i);
    await screenshot(page, output, 'home-390');

    // Closed games cannot be reopened with a direct/legacy/deep URL. Every
    // guarded route is canonicalized to Home and focused on the games catalog.
    for (const closedRoute of CLOSED_GAME_ROUTES) {
      await page.goto(routeUrl(closedRoute), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction(() => location.hash === '#/');
      await settle(page);
      const redirectState = await page.evaluate(() => ({
        target: history.state?.bitvaScrollTarget,
        gamesTop: document.querySelector('#games')?.getBoundingClientRect().top,
        hasClosedLayout: Boolean(document.querySelector('.l56-page, .l7-page')),
      }));
      assert.equal(redirectState.target, 'games', `${closedRoute}: redirect did not retain the games target`);
      assert.ok(Math.abs(redirectState.gamesTop) < 25, `${closedRoute}: games section is not focused: ${JSON.stringify(redirectState)}`);
      assert.equal(redirectState.hasClosedLayout, false, `${closedRoute}: a closed-game layout was rendered`);
    }
    report.checks.closedGameRoutes = 'PASS';

    await priceLinks.first().click();
    await page.waitForFunction(() => location.hash === '#/music-buy-blanks');
    await page.waitForFunction(() => Math.abs(document.querySelector('#music-buy-blanks')?.getBoundingClientRect().top || 9999) < 5);
    report.checks.home = 'PASS';

    // Music Lotto: Figma hero asset/tags/copy and in-page CTA behavior.
    await openRoute(page, 'music-detail');
    const music = page.locator('.music-detail-page');
    const hero = music.locator('.music-detail-photo');
    assert.match(await hero.getAttribute('src'), /\/figma-assets\/music-detail-hero-party\.png$/);
    assert.deepEqual(await hero.evaluate((image) => ({ complete: image.complete, naturalWidth: image.naturalWidth > 0 })), { complete: true, naturalWidth: true });
    const tags = await music.locator('.music-detail-tags > span').allTextContents();
    assert.deepEqual(tags.map(normalizeText), ['🔥 за монеты', 'от 3-х человек', 'без реквизита']);
    const attention = music.locator('.music-feature-card.is-attention');
    assert.equal(normalizeText(await attention.locator('h2').textContent()), 'Обратите внимание!');
    assert.equal(normalizeText(await attention.locator('.music-feature-copy').textContent()), 'для игры понадобятся бланки, которые можно приобрести ниже');
    assert.equal(await attention.locator('a.music-blanks-attention[href="#/music-buy-blanks"]').count(), 1);
    const howButton = music.getByRole('button', { name: 'Как играть?', exact: true });
    assert.equal(await howButton.count(), 1);
    await howButton.click();
    await page.waitForFunction(() => Math.abs(document.querySelector('#music-how')?.getBoundingClientRect().top || 9999) < 5);
    await music.locator('.music-detail-hero').screenshot({ path: path.join(output, 'music-hero-390.png'), animations: 'disabled' });
    await attention.screenshot({ path: path.join(output, 'music-attention-390.png'), animations: 'disabled' });
    report.checks.musicDetail = 'PASS';

    // Fallen songs: a deliberately long title must wrap instead of ellipsizing.
    await openRoute(page, 'music-songs');
    const rows = page.locator('.music-songs-list .music-song-row');
    await rows.first().waitFor({ state: 'visible' });
    assert.ok(await rows.count() >= 2, 'The mocked played-song history was not rendered');
    const longRow = rows.first();
    const songMetrics = await longRow.locator('.music-song-name').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent.trim(),
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        lineHeight: Number.parseFloat(style.lineHeight),
        parentOverflow: getComputedStyle(element.parentElement).overflow,
      };
    });
    assert.match(songMetrics.text, /Женя Трофимов/);
    assert.equal(songMetrics.whiteSpace, 'normal');
    assert.equal(songMetrics.textOverflow, 'clip');
    assert.notEqual(songMetrics.overflow, 'hidden');
    assert.notEqual(songMetrics.parentOverflow, 'hidden');
    assert.ok(songMetrics.scrollWidth <= songMetrics.clientWidth + 1, `Long song title overflows horizontally: ${JSON.stringify(songMetrics)}`);
    assert.ok(songMetrics.clientHeight >= songMetrics.lineHeight * 1.9, `Long song title did not wrap to its second line: ${JSON.stringify(songMetrics)}`);
    await screenshot(page, output, 'fallen-songs-390');
    report.checks.fallenSongs = 'PASS';

    // Account: only ID is shown, and Support really navigates to the Telegram account.
    sessionUser = fullUser;
    await openRoute(page, 'profile');
    const profileHead = page.locator('.profile-head');
    assert.equal(normalizeText(await profileHead.locator('p').textContent()), 'ID 0427');
    assert.equal(normalizeText(await profileHead.textContent()).includes('@'), false, 'Profile must not display an @handle');
    const supportControl = page.locator('.account-list').locator('a, button').filter({ hasText: 'Поддержка' });
    assert.equal(await supportControl.count(), 1, 'Support control is missing or duplicated');
    if ((await supportControl.evaluate((element) => element.tagName)) === 'A') {
      assert.equal(await supportControl.getAttribute('href'), SUPPORT_URL);
    }
    await supportControl.click();
    await page.waitForURL((url) => url.hostname === 't.me' && url.pathname === '/bitva_org', { timeout: 10000 });
    assert.equal(page.url(), SUPPORT_URL);
    await openRoute(page, 'profile');
    await screenshot(page, output, 'profile-390');
    report.checks.profile = 'PASS';

    // Purchases: canonical route, legacy redirect, ID-only identity and unclipped final CTA.
    await openRoute(page, 'karaoke-battle-purchases');
    await page.waitForFunction(() => location.hash === '#/purchases');
    assert.equal(page.url(), routeUrl('purchases'));
    assert.equal(normalizeText(await page.locator('.l5x-purchase-meta').textContent()), 'ID 0427');
    assert.equal(normalizeText(await page.locator('.l5x-purchase-identity').textContent()).includes('@'), false);

    for (const width of [320, 390, 540]) {
      await page.setViewportSize({ width, height: 844 });
      sessionUser = fullUser;
      await openRoute(page, 'purchases');
      assert.equal(page.url(), routeUrl('purchases'));
      const showAll = page.getByRole('button', { name: 'Показать все покупки', exact: true });
      const metrics = await assertElementIsNotClipped(showAll, `purchases ${width}px`);
      report.viewports[width] = metrics;
      await screenshot(page, output, `purchases-${width}`);
    }

    // Empty purchases: Choose game lands on the home games section, not the top.
    await page.setViewportSize({ width: 390, height: 844 });
    sessionUser = emptyUser;
    // A cache-busting document navigation is intentional: the app loads account
    // state once per mount, while the deterministic API mock changed users here.
    await page.goto(`${BASE_URL}/?qa=empty-${Date.now()}#/purchases`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await settle(page);
    const chooseGame = page.getByRole('button', { name: 'Выбрать игру', exact: true });
    await chooseGame.waitFor({ state: 'visible', timeout: 10000 });
    await chooseGame.click();
    await page.waitForFunction(() => location.hash === '#/');
    await page.waitForTimeout(500);
    const gamesTarget = await page.evaluate(() => ({
      top: document.querySelector('#games')?.getBoundingClientRect().top,
      scrollY: window.scrollY,
      historyTarget: history.state?.bitvaScrollTarget,
    }));
    // The 540px Figma canvas is scaled into the mobile viewport, so the
    // transformed section can retain a small (< 25px) visual top inset.
    assert.ok(Math.abs(gamesTarget.top) < 25, `Choose game did not align the games section: ${JSON.stringify(gamesTarget)}`);
    assert.ok(gamesTarget.scrollY > 100, `Choose game did not scroll away from the top of the home page: ${JSON.stringify(gamesTarget)}`);
    await screenshot(page, output, 'choose-game-target-390', { fullPage: false });
    report.checks.purchases = 'PASS';

    assert.deepEqual(pageErrors, [], `Uncaught page errors: ${JSON.stringify(pageErrors)}`);
    report.pageErrors = pageErrors;
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
  } finally {
    await context?.close().catch(() => {});
    await ensureProfileProcessesClosed(profile);
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('bitva-pravki2-qa-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
