const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '0');
  });
  await page.goto('http://127.0.0.1:5173/#/game-detail');
  const guestButton = page.locator('.detail-nav .close-user');
  await guestButton.waitFor();
  const guestLabel = (await guestButton.textContent()).trim();
  if (guestLabel !== 'Войти') throw new Error(`Guest label is ${guestLabel}`);
  if (await page.locator('.detail-nav .detail-account').count()) throw new Error('Account controls are visible to a guest');
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (bodyWidth > 390) throw new Error(`Horizontal overflow: ${bodyWidth}px`);
  await guestButton.click();
  await page.waitForURL(/#\/login$/);
  await browser.close();
  console.log(JSON.stringify({ guestLabel, accountControls: 0, bodyWidth, routeAfterClick: 'login' }));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
