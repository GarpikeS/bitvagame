const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:5173/#/register');
    await page.getByLabel('Ваше имя').fill('Тестовый пользователь');
    await page.getByLabel('Электронная почта').fill('qa@example.com');
    await page.getByLabel('Пароль', { exact: true }).fill('Password123');
    await page.getByLabel('Подтвердите пароль').fill('Password123');
    await page.locator('.checkbox').click({ position: { x: 12, y: 12 } });

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/auth/register'));
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 503);
    assert.match(await page.locator('.auth-field-error').last().textContent(), /писем ещё не настроена/i);
    assert.match(page.url(), /#\/register$/);

    console.log(JSON.stringify({
      apiStatus: response.status(),
      route: 'register',
      emailFailureShown: true,
      viewport: '390x844',
    }));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
