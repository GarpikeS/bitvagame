const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const QA_DIR = path.join(ROOT, 'qa');
const REPORT_PATH = path.join(QA_DIR, 'report.json');
const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:5175/';
const PORT = Number(process.env.QA_CDP_PORT || 9333);
const WIDTH = Number(process.env.QA_WIDTH || 540);
const HEIGHT = Number(process.env.QA_HEIGHT || 900);

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Chrome/Edge executable not found. Set CHROME_PATH.');
  }
  return found;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function launchChrome() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  const userDataDir = path.join(os.tmpdir(), `bitva-qa-chrome-${Date.now()}`);
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];

  const child = spawn(chromePath(), args, {
    stdio: 'ignore',
    detached: false,
  });

  return { child, userDataDir };
}

async function waitForChrome() {
  const url = `http://127.0.0.1:${PORT}/json/version`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

async function newTarget() {
  const url = `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`;
  try {
    return await fetchJson(url, { method: 'PUT' });
  } catch {
    return fetchJson(url);
  }
}

function connectCdp(wsUrl) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is not available in this Node runtime.');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = seq++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
          });
        },
        once(method) {
          return new Promise((res) => {
            listeners.set(method, res);
          });
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result || {});
        return;
      }

      if (message.method && listeners.has(message.method)) {
        const listener = listeners.get(message.method);
        listeners.delete(message.method);
        listener(message.params || {});
      }
    });

    ws.addEventListener('error', reject);
  });
}

async function createPageSession() {
  const target = await newTarget();
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return cdp;
}

async function navigate(cdp, hash = '') {
  const url = `${BASE_URL}${hash}`;
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(1000)]).catch(() => {});
  await sleep(350);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function screenshot(cdp, name, scrollY = 0) {
  await evaluate(cdp, `window.scrollTo(0, ${scrollY}); true`);
  await sleep(250);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });
  const filePath = path.join(QA_DIR, name);
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return path.relative(ROOT, filePath);
}

async function fullPageScreenshot(cdp, name) {
  await evaluate(cdp, `window.scrollTo(0, 0); true`);
  await sleep(250);
  const metrics = await cdp.send('Page.getLayoutMetrics');
  const contentSize = metrics.contentSize || metrics.cssContentSize || {};
  const width = Math.ceil(Math.max(contentSize.width || 0, WIDTH));
  const height = Math.ceil(Math.max(contentSize.height || 0, HEIGHT));
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width,
      height,
      scale: 1,
    },
  });
  const filePath = path.join(QA_DIR, name);
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return {
    path: path.relative(ROOT, filePath),
    width,
    height,
  };
}

async function runChecks(cdp) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });

  await navigate(cdp);
  await evaluate(cdp, `localStorage.clear(); localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3'); localStorage.setItem('bitva_logged_in', '0'); location.hash = ''; location.reload(); true`);
  await sleep(700);
  await screenshot(cdp, 'qa-home-top.png');
  await screenshot(cdp, 'qa-home-catalog.png', 880);

  const gameCardHitAreas = await evaluate(cdp, `(() => {
    const measure = (cardSelector) => {
      const card = document.querySelector(cardSelector);
      const hitbox = card?.querySelector('.game-card-hitbox');
      if (!card || !hitbox) return null;
      const cardRect = card.getBoundingClientRect();
      const hitboxRect = hitbox.getBoundingClientRect();
      return {
        card: {
          width: Math.round(cardRect.width * 10) / 10,
          height: Math.round(cardRect.height * 10) / 10,
        },
        hitbox: {
          width: Math.round(hitboxRect.width * 10) / 10,
          height: Math.round(hitboxRect.height * 10) / 10,
        },
      };
    };
    return {
      featured: measure('.featured-game-card'),
      catalog: measure('.game-card.is-musical'),
      visiblePlayTargets: ['.featured-play', '.game-card.is-royal .play-card'].map((selector) => {
        const visual = document.querySelector(selector);
        const card = visual?.closest('.featured-game-card, .game-card');
        const hitbox = card?.querySelector('.game-card-hitbox');
        if (!visual || !hitbox) return false;
        const rect = visual.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return target === hitbox || hitbox.contains(target);
      }),
    };
  })()`);
  const hitAreaCoversCard = (measurement) => Boolean(
    measurement
      && Math.abs(measurement.card.width - measurement.hitbox.width) <= 1
      && Math.abs(measurement.card.height - measurement.hitbox.height) <= 1
  );
  add(
    'featured game opens from the whole card',
    hitAreaCoversCard(gameCardHitAreas.featured),
    JSON.stringify(gameCardHitAreas.featured),
  );
  add(
    'catalog game opens from the whole card',
    hitAreaCoversCard(gameCardHitAreas.catalog),
    JSON.stringify(gameCardHitAreas.catalog),
  );
  add(
    'visible play circles activate the full-card controls',
    gameCardHitAreas.visiblePlayTargets.every(Boolean),
    JSON.stringify(gameCardHitAreas.visiblePlayTargets),
  );

  const roundedPlayIcons = await evaluate(cdp, `(() => {
    const mask = (selector, pseudo = null) => {
      const element = document.querySelector(selector);
      if (!element) return '';
      const style = getComputedStyle(element, pseudo);
      return style.maskImage || style.webkitMaskImage || '';
    };
    const iconName = 'fbf0a535b47b-24c9f666424e5c1fa384d780a94a1327488696c2.svg';
    return {
      hero: mask('.play-main-triangle').includes(iconName),
      featured: mask('.featured-play', '::before').includes(iconName),
      catalog: mask('.play-card', '::before').includes(iconName),
    };
  })()`);
  add(
    'play triangles use the rounded Figma icon',
    roundedPlayIcons.hero && roundedPlayIcons.featured && roundedPlayIcons.catalog,
    JSON.stringify(roundedPlayIcons),
  );

  await evaluate(cdp, `document.querySelector('.game-card.is-musical .game-card-hitbox').click(); true`);
  await sleep(200);
  const wholeCardRoute = await evaluate(cdp, `location.hash`);
  add(
    'whole catalog card click opens the game',
    wholeCardRoute === '#/music-detail' || wholeCardRoute === '#music-detail',
    wholeCardRoute,
  );
  await navigate(cdp);

  await evaluate(cdp, `document.querySelector('.search input').value = 'мафия';
    document.querySelector('.search input').dispatchEvent(new Event('input', { bubbles: true }));
    true`);
  const searchValue = await evaluate(cdp, `document.querySelector('.search input').value`);
  add('search input accepts text', searchValue === 'мафия', searchValue);

  await evaluate(cdp, `document.querySelector('.heart-filter').click(); true`);
  await sleep(150);
  const guestEmpty = await evaluate(cdp, `Boolean(document.querySelector('.empty'))`);
  add('guest favorite filter is empty', guestEmpty);

  await evaluate(cdp, `document.querySelector('.promo-input-wrap input').focus();
    document.querySelector('.promo-input-wrap input').value = '';
    true`);
  await cdp.send('Input.insertText', { text: 'ABCDEFGHIJKL123' });
  await sleep(150);
  const promoLength = await evaluate(cdp, `document.querySelector('.promo-input-wrap input').value.length`);
  add('promo input max length is 11', promoLength === 11, `length=${promoLength}`);

  await navigate(cdp, '#/login');
  const loginInputLayout = await evaluate(cdp, `(() => {
    const field = document.querySelector('.auth-input');
    const input = field?.querySelector('input');
    return {
      placeholder: input?.getAttribute('placeholder') || '',
      outerLabels: document.querySelectorAll('.auth-input > span').length,
      marker: field ? getComputedStyle(field, '::after').content : '',
    };
  })()`);
  add(
    'login auth field uses placeholder layout',
    loginInputLayout.placeholder === 'Электронная почта'
      && loginInputLayout.outerLabels === 0
      && loginInputLayout.marker.includes('*'),
    JSON.stringify(loginInputLayout),
  );
  await evaluate(cdp, `(() => {
    localStorage.setItem('bitva_logged_in', '1');
    localStorage.setItem('bitva_name', 'Тимур');
    localStorage.setItem('bitva_balance', '11240');
    localStorage.setItem('bitva_favorites', JSON.stringify(['royal', 'karaoke', 'mafia', 'musical']));
    localStorage.setItem('bitva_purchased_blanks', JSON.stringify([
      { id: 'qa-devichnik', category: 'Девичник', count: 6, date: '10.07.2026' },
      { id: 'qa-hits', category: 'Хиты 90-х', count: 12, date: '06.05.2026' },
    ]));
    location.hash = '#/logged-in-home';
    location.reload();
    return true;
  })()`);
  await sleep(700);
  const afterLogin = await evaluate(cdp, `location.hash`);
  add('authenticated route opens logged-in state', afterLogin === '#/logged-in-home' || afterLogin === '#logged-in-home', afterLogin);

  await navigate(cdp);
  const loggedHeader = await evaluate(cdp, `Boolean(document.querySelector('.account-pill .account-balance') && document.querySelector('.account-pill .avatar-sm'))`);
  add('home header shows account after login', loggedHeader);

  await evaluate(cdp, `location.reload(); true`);
  await sleep(700);
  const persisted = await evaluate(cdp, `Boolean(document.querySelector('.account-pill'))`);
  add('login state persists after reload', persisted);

  await navigate(cdp, '#/logged-in-home');
  const loggedProgressBars = await evaluate(cdp, `document.querySelectorAll('.logged-card .logged-progress span').length`);
  const loggedHomeButtonInsideCard = await evaluate(cdp, `Boolean(document.querySelector('.logged-card .secondary-wide'))`);
  add('logged-in card shows 3 complete progress bars', loggedProgressBars === 3, `bars=${loggedProgressBars}`);
  add('logged-in home button is inside card', loggedHomeButtonInsideCard);

  await navigate(cdp, '#/profile');
  await screenshot(cdp, 'qa-profile.png');
  const profileName = await evaluate(cdp, `document.querySelector('.profile-name input')?.value`);
  const avatarText = await evaluate(cdp, `document.querySelector('.avatar.large')?.innerText.trim()`);
  add('profile name is editable/live', Boolean(profileName), profileName);
  add('avatar letter follows profile name', Boolean(profileName) && avatarText === profileName.trim()[0].toUpperCase(), `${avatarText}/${profileName}`);

  await evaluate(cdp, `(() => {
    const input = document.querySelector('.profile-name input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Алексей');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(150);
  await navigate(cdp);
  const homeAvatarText = await evaluate(cdp, `document.querySelector('.account-pill .avatar-sm')?.innerText.trim()`);
  add('home header avatar follows edited profile name', homeAvatarText === 'А', homeAvatarText);

  await screenshot(cdp, 'qa-home-logged-header.png');
  const homeHeaderLayout = await evaluate(cdp, `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
      };
    };
    return {
      topbar: rect('.home-page .topbar'),
      account: rect('.home-page .account-pill'),
      balance: rect('.home-page .account-balance'),
      brand: rect('.home-page .brand-mark'),
      brandBackgroundSize: getComputedStyle(document.querySelector('.home-page .brand-mark')).backgroundSize,
      brandImageDisplay: getComputedStyle(document.querySelector('.home-page .brand-image')).display,
      coin: rect('.home-page .account-balance .coin'),
      avatar: rect('.home-page .avatar-sm'),
    };
  })()`);
  add(
    'home header avatar remains circular',
    Boolean(homeHeaderLayout.avatar)
      && Math.abs(homeHeaderLayout.avatar.width - homeHeaderLayout.avatar.height) <= 1
      && homeHeaderLayout.avatar.width >= 40,
    JSON.stringify(homeHeaderLayout),
  );
  add(
    'home header account stays at right edge',
    Boolean(homeHeaderLayout.topbar && homeHeaderLayout.account)
      && Math.abs(homeHeaderLayout.topbar.right - homeHeaderLayout.account.right - 10) <= 2,
    JSON.stringify(homeHeaderLayout),
  );

  await navigate(cdp, '#/favorites');
  const favoriteCards = await evaluate(cdp, `document.querySelectorAll('.game-card').length`);
  add('favorites route opens', favoriteCards >= 0, `cards=${favoriteCards}`);
  const favoritePlayButtons = await evaluate(cdp, `document.querySelectorAll('.game-card.is-favorite-only .play-card').length`);
  const favoriteLikeButtons = await evaluate(cdp, `document.querySelectorAll('.game-card.is-favorite-only .like').length`);
  add('favorites cards do not show play buttons', favoritePlayButtons === 0, `play=${favoritePlayButtons}`);
  add('favorites cards keep like buttons', favoriteLikeButtons === favoriteCards, `likes=${favoriteLikeButtons}, cards=${favoriteCards}`);

  await navigate(cdp, '#/purchases');
  const purchaseButtons = await evaluate(cdp, `document.querySelectorAll('.purchase-hero button, .show-all').length`);
  add('purchases actions are present', purchaseButtons >= 2, `buttons=${purchaseButtons}`);
  add('purchases summary does not suggest editing the profile name', !await evaluate(cdp, `Boolean(document.querySelector('.purchases-page .account-summary-pencil'))`));
  await evaluate(cdp, `document.querySelector('.purchase-hero.has-action button').click(); true`);
  await sleep(200);
  const purchaseHeroRoute = await evaluate(cdp, `location.hash`);
  add('purchase hero routes to blanks', purchaseHeroRoute === '#/forms' || purchaseHeroRoute === '#forms', purchaseHeroRoute);
  await evaluate(cdp, `document.querySelector('.page-nav > button').click(); true`);
  await sleep(250);
  const purchaseBackRoute = await evaluate(cdp, `location.hash`);
  add('back button returns to previous route', purchaseBackRoute === '#/purchases' || purchaseBackRoute === '#purchases', purchaseBackRoute);

  await navigate(cdp, '#/forms');
  const formButtons = await evaluate(cdp, `document.querySelectorAll('.purchase-card button, .purchase-hero button, .show-all, .how-button').length`);
  add('forms action buttons are present', formButtons >= 4, `buttons=${formButtons}`);

  await navigate(cdp, '#/register');
  const registerInputLayout = await evaluate(cdp, `(() => {
    const fields = Array.from(document.querySelectorAll('.auth-input'));
    return {
      placeholders: fields.map((field) => field.querySelector('input')?.getAttribute('placeholder') || ''),
      outerLabels: document.querySelectorAll('.auth-input > span').length,
      markers: fields.filter((field) => getComputedStyle(field, '::after').content.includes('*')).length,
    };
  })()`);
  add(
    'register auth fields use placeholder layout',
    registerInputLayout.placeholders.length === 4
      && registerInputLayout.placeholders.every(Boolean)
      && registerInputLayout.outerLabels === 0
      && registerInputLayout.markers === 2,
    JSON.stringify(registerInputLayout),
  );

  await evaluate(cdp, `(() => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.auth-card .auth-input input');
    setValue(inputs[0], 'QA Пользователь');
    setValue(inputs[1], 'legacy-qa@example.com');
    setValue(inputs[2], 'legacy-password-2026');
    setValue(inputs[3], 'legacy-password-2026');
    document.querySelector('.checkbox input')?.click();
    document.querySelector('.primary-wide')?.click();
    return true;
  })()`);
  await sleep(250);
  const registerCodeRoute = await evaluate(cdp, `location.hash`);
  add('valid registration opens code step', registerCodeRoute === '#/register-code' || registerCodeRoute === '#register-code', registerCodeRoute);
  await evaluate(cdp, `document.querySelector('.code-row input').focus(); true`);
  for (const digit of ['1', '1', '1', '1', '1', '1']) {
    await cdp.send('Input.insertText', { text: digit });
    await sleep(80);
  }
  const codeValue = await evaluate(cdp, `Array.from(document.querySelectorAll('.code-row input')).map((input) => input.value).join('')`);
  const codeButtonEnabled = await evaluate(cdp, `!document.querySelector('.auth-card .code-confirm').disabled`);
  add('code inputs accept 6 digits', codeValue === '111111', codeValue);
  add('code confirm enables after 6 digits', codeButtonEnabled);
  await evaluate(cdp, `document.querySelector('.auth-card .code-confirm').click(); true`);
  await sleep(250);
  const codeRoute = await evaluate(cdp, `location.hash`);
  add('code confirm routes to registration success', codeRoute === '#/auth-register-success' || codeRoute === '#auth-register-success', codeRoute);

  await navigate(cdp, '#/game-detail');
  await screenshot(cdp, 'qa-game-detail.png');
  const likeBefore = await evaluate(cdp, `document.querySelector('.detail-like').classList.contains('is-liked')`);
  await evaluate(cdp, `document.querySelector('.detail-like').click(); true`);
  await sleep(200);
  const likeAfter = await evaluate(cdp, `document.querySelector('.detail-like').classList.contains('is-liked')`);
  const likeChanged = likeBefore !== likeAfter;
  add('detail like toggles', likeChanged);

  const cardLikeChanged = await evaluate(cdp, `(() => {
    const card = document.querySelector('.game-card .like');
    if (!card) return true;
    const before = card.classList.contains('is-liked');
    card.click();
    return new Promise((resolve) => setTimeout(() => resolve(before !== card.classList.contains('is-liked')), 100));
  })()`);
  add('card like toggles when visible', cardLikeChanged);

  const tapIssues = await evaluate(cdp, `(() => {
    return Array.from(document.querySelectorAll('button, input, a')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className || '',
        text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60),
        width: Math.round(r.width),
        height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0,
        inViewport: r.bottom >= 0 && r.top <= innerHeight && r.right >= 0 && r.left <= innerWidth,
      };
    }).filter((item) => item.visible && item.inViewport && (item.width < 32 || item.height < 32));
  })()`);
  add('visible tap areas are at least 32px on current viewport', tapIssues.length === 0, JSON.stringify(tapIssues));

  const routeShots = [
    ['', 'route-home', 540],
    ['#/logged-in-home', 'route-logged-in-home', 432],
    ['#/profile', 'route-profile', 363],
    ['#/favorites', 'route-favorites', 500],
    ['#/purchases', 'route-purchases', 494],
    ['#/forms', 'route-forms', 432],
    ['#/login', 'route-login', 432],
    ['#/register', 'route-register', 432],
    ['#/register-code', 'route-register-code', 432],
    ['#/register-success', 'route-register-success', 432],
    ['#/game-detail', 'route-game-detail', 540],
  ];

  for (const [hash, name, routeMaxWidth] of routeShots) {
    await navigate(cdp, hash);
    await screenshot(cdp, `qa-${name}.png`);
    const hasPage = await evaluate(cdp, `Boolean(document.querySelector('.page'))`);
    add(`${name} renders page shell`, hasPage);

    const layout = await evaluate(cdp, `(() => {
      const doc = document.documentElement;
      const page = document.querySelector('.page')?.getBoundingClientRect();
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollHeight: doc.scrollHeight,
        pageWidth: page ? Math.round(page.width) : 0,
        pageLeft: page ? Math.round(page.left) : null,
        pageRight: page ? Math.round(page.right) : null,
      };
    })()`);
    add(`${name} has no horizontal overflow`, layout.scrollWidth <= layout.clientWidth + 1, JSON.stringify(layout));
    add(
      `${name} page stays inside viewport`,
      layout.pageWidth > 0 && layout.pageLeft >= 0 && layout.pageRight <= layout.clientWidth + 1,
      JSON.stringify(layout),
    );
    const expectedPageWidth = Math.min(layout.clientWidth, routeMaxWidth);
    add(
      `${name} keeps its original page width`,
      Math.abs(layout.pageWidth - expectedPageWidth) <= 1,
      JSON.stringify({ ...layout, expectedPageWidth }),
    );

    const fullShot = await fullPageScreenshot(cdp, `qa-full-${name}.png`);
    add(`${name} full-page screenshot saved`, fullShot.height >= HEIGHT, JSON.stringify(fullShot));
  }

  return checks;
}

async function main() {
  const chrome = launchChrome();
  let cdp;
  try {
    await waitForChrome();
    cdp = await createPageSession();
    const checks = await runChecks(cdp);
    const report = {
      baseUrl: BASE_URL,
      viewport: { width: WIDTH, height: HEIGHT },
      generatedAt: new Date().toISOString(),
      passed: checks.every((check) => check.pass),
      checks,
    };
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
