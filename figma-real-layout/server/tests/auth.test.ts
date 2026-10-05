import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import { EmailNotConfiguredError, ResendMailer, SmtpMailer, type AuthMailer, type SendCodeMessage } from '../src/mailer.js';
import { JsonAuthStore } from '../src/store.js';

class CaptureMailer implements AuthMailer {
  isConfigured = true;
  messages: SendCodeMessage[] = [];
  async sendCode(message: SendCodeMessage): Promise<void> {
    this.messages.push(message);
  }
}

function configFor(dataFile: string): AuthConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    production: false,
    appOrigin: 'http://127.0.0.1:5173',
    appOrigins: ['http://127.0.0.1:5173', 'https://bitvagame.ru'],
    authSecret: 'test-secret-with-more-than-thirty-two-characters',
    dataFile,
    resendApiKey: '',
    emailFrom: '',
    sessionDays: 30,
    codeLifetimeMinutes: 10,
    codeCooldownSeconds: 60,
    maxCodeAttempts: 5,
    maxEmailsPerHour: 5,
    promoAdminToken: 'test-promo-admin-token-with-thirty-two-characters',
  };
}

test('state-changing requests accept configured domains and reject unknown origins', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-auth-origin-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const app = await buildApp({ config, store: new JsonAuthStore(config.dataFile), mailer: new CaptureMailer(), logger: false });
  context.after(() => app.close());

  const configuredOrigin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'https://bitvagame.ru' },
    payload: { email: 'missing@example.com', password: 'Password123' },
  });
  assert.equal(configuredOrigin.statusCode, 401);
  assert.equal(configuredOrigin.json().error.code, 'INVALID_CREDENTIALS');

  const unknownOrigin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'https://example.com' },
    payload: { email: 'missing@example.com', password: 'Password123' },
  });
  assert.equal(unknownOrigin.statusCode, 403);
  assert.equal(unknownOrigin.json().error.code, 'ORIGIN_NOT_ALLOWED');
});

function cookieFrom(headers: Record<string, unknown>, name: string): string {
  const source = headers['set-cookie'];
  const values = Array.isArray(source) ? source : [source];
  const cookie = values.find((value) => String(value).startsWith(`${name}=`));
  assert.ok(cookie, `Cookie ${name} is missing`);
  return String(cookie).split(';')[0];
}

test('registration, session, password login and recovery use server state', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-auth-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let now = Date.UTC(2026, 7, 4, 10, 0, 0);
  const mailer = new CaptureMailer();
  const config = configFor(join(directory, 'auth.json'));
  const app = await buildApp({ config, store: new JsonAuthStore(config.dataFile), mailer, now: () => now, logger: false });
  context.after(() => app.close());

  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Владимир Сиваев', email: 'Sivaeva@Gmail.com', password: 'Password123' },
  });
  assert.equal(registration.statusCode, 202);
  assert.equal(mailer.messages.length, 1);
  assert.equal(mailer.messages[0]?.purpose, 'register');
  assert.match(mailer.messages[0]?.code || '', /^\d{6}$/);

  const cooldown = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Владимир Сиваев', email: 'sivaeva@gmail.com', password: 'Password123' },
  });
  assert.equal(cooldown.statusCode, 429);
  assert.equal(cooldown.json().error.code, 'CODE_COOLDOWN');

  const wrongCode = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'sivaeva@gmail.com', code: '000000', purpose: 'register' },
  });
  assert.equal(wrongCode.statusCode, 400);
  assert.equal(wrongCode.json().error.code, 'INVALID_CODE');

  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'sivaeva@gmail.com', code: mailer.messages[0]?.code, purpose: 'register' },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.name, 'Владимир Сиваев');
  const sessionCookie = cookieFrom(verified.headers, 'bitva_session');

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: sessionCookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, 'sivaeva@gmail.com');

  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: sessionCookie } });
  assert.equal(logout.statusCode, 200);
  const revoked = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: sessionCookie } });
  assert.equal(revoked.statusCode, 401);

  now += 61_000;
  const loginCodeRequest = await app.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'sivaeva@gmail.com' },
  });
  assert.equal(loginCodeRequest.statusCode, 202);
  const loginMessage = mailer.messages.at(-1);
  assert.equal(loginMessage?.purpose, 'login');
  const codeLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'sivaeva@gmail.com', code: loginMessage?.code, purpose: 'login' },
  });
  assert.equal(codeLogin.statusCode, 200);
  assert.equal(codeLogin.json().user.email, 'sivaeva@gmail.com');
  assert.match(cookieFrom(codeLogin.headers, 'bitva_session'), /^bitva_session=/);

  const wrongPassword = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'sivaeva@gmail.com', password: 'WrongPassword1' },
  });
  assert.equal(wrongPassword.statusCode, 401);

  const passwordLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'sivaeva@gmail.com', password: 'Password123' },
  });
  assert.equal(passwordLogin.statusCode, 200);

  now += 61_000;
  const recovery = await app.inject({
    method: 'POST',
    url: '/api/auth/forgot-password',
    payload: { email: 'sivaeva@gmail.com' },
  });
  assert.equal(recovery.statusCode, 202);
  const recoveryMessage = mailer.messages.at(-1);
  assert.equal(recoveryMessage?.purpose, 'recovery');
  const recoveryVerified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'sivaeva@gmail.com', code: recoveryMessage?.code, purpose: 'recovery' },
  });
  assert.equal(recoveryVerified.statusCode, 200);
  const resetCookie = cookieFrom(recoveryVerified.headers, 'bitva_reset');

  const reset = await app.inject({
    method: 'POST',
    url: '/api/auth/reset-password',
    headers: { cookie: resetCookie },
    payload: { password: 'NewPassword456' },
  });
  assert.equal(reset.statusCode, 200);

  const oldLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'sivaeva@gmail.com', password: 'Password123' },
  });
  assert.equal(oldLogin.statusCode, 401);
  const newLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'sivaeva@gmail.com', password: 'NewPassword456' },
  });
  assert.equal(newLogin.statusCode, 200);
});

test('mail configuration errors do not leave usable challenges', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-auth-disabled-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const disabledMailer: AuthMailer = {
    isConfigured: false,
    async sendCode() { throw new EmailNotConfiguredError(); },
  };
  const app = await buildApp({ config, store: new JsonAuthStore(config.dataFile), mailer: disabledMailer, logger: false });
  context.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Тест', email: 'test@example.com', password: 'Password123' },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'EMAIL_NOT_CONFIGURED');
  const database = await new JsonAuthStore(config.dataFile).read((value) => value);
  assert.equal(database.challenges.length, 0);
});

test('fixed code confirms registration only and never bypasses login email delivery', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-auth-fixed-registration-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  config.fixedRegistrationCode = '111111';
  let mailAttempts = 0;
  const disabledMailer: AuthMailer = {
    isConfigured: false,
    async sendCode() {
      mailAttempts += 1;
      throw new EmailNotConfiguredError();
    },
  };
  const app = await buildApp({ config, store: new JsonAuthStore(config.dataFile), mailer: disabledMailer, logger: false });
  context.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.json().emailConfigured, false);
  assert.equal(health.json().registrationVerificationConfigured, true);

  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Тест', email: 'fixed@example.com', password: 'Password123' },
  });
  assert.equal(registration.statusCode, 202);
  assert.equal(mailAttempts, 0);

  const wrongCode = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'fixed@example.com', code: '000000', purpose: 'register' },
  });
  assert.equal(wrongCode.statusCode, 400);

  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'fixed@example.com', code: '111111', purpose: 'register' },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.email, 'fixed@example.com');

  const loginCode = await app.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'fixed@example.com' },
  });
  assert.equal(loginCode.statusCode, 503);
  assert.equal(loginCode.json().error.code, 'EMAIL_NOT_CONFIGURED');
  assert.equal(mailAttempts, 1);
});

test('Resend mailer sends the generated code only to the configured API', async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ id: 'email_test' }), { status: 200 });
  }) as typeof fetch;

  try {
    const mailer = new ResendMailer('re_test_key', 'Битва игр <no-reply@example.com>');
    await mailer.sendCode({
      to: 'user@example.com',
      code: '483921',
      purpose: 'login',
      expiresMinutes: 10,
      idempotencyKey: 'auth-test-id',
    });

    assert.equal(request?.input, 'https://api.resend.com/emails');
    assert.equal(new Headers(request?.init?.headers).get('authorization'), 'Bearer re_test_key');
    assert.equal(new Headers(request?.init?.headers).get('idempotency-key'), 'auth-test-id');
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.from, 'Битва игр <no-reply@example.com>');
    assert.deepEqual(body.to, ['user@example.com']);
    assert.match(body.text, /483921/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SMTP mailer sends the generated code through the configured transport', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const mailer = new SmtpMailer({
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    user: 'bitvagame@muzlotodoma.ru',
    password: 'test-app-password',
  }, 'Битва Игры <bitvagame@muzlotodoma.ru>', {
    async sendMail(message) {
      sent.push(message as Record<string, unknown>);
      return { accepted: [message.to] };
    },
  });

  await mailer.sendCode({
    to: 'player@example.com',
    code: '483921',
    purpose: 'login',
    expiresMinutes: 10,
    idempotencyKey: 'auth-test-challenge',
  });

  assert.equal(mailer.isConfigured, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.from, 'Битва Игры <bitvagame@muzlotodoma.ru>');
  assert.equal(sent[0]?.to, 'player@example.com');
  assert.equal(sent[0]?.subject, 'Код для входа — Битва игр');
  assert.match(String(sent[0]?.text), /483921/);
  assert.match(String(sent[0]?.html), /483921/);
  assert.deepEqual(sent[0]?.headers, { 'X-Auth-Challenge-Id': 'auth-test-challenge' });
});
