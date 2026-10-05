import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import type { AuthMailer, SendCodeMessage } from '../src/mailer.js';
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
    appOrigins: ['http://127.0.0.1:5173'],
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

function cookieFrom(headers: Record<string, unknown>): string {
  const source = headers['set-cookie'];
  const values = Array.isArray(source) ? source : [source];
  const cookie = values.find((value) => String(value).startsWith('bitva_session='));
  assert.ok(cookie, 'Session cookie is missing');
  return String(cookie).split(';')[0];
}

async function registerUser(app: Awaited<ReturnType<typeof buildApp>>, mailer: CaptureMailer, email: string): Promise<string> {
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: email.split('@')[0], email, password: 'Password123' },
  });
  assert.equal(registration.statusCode, 202);
  const message = mailer.messages.at(-1);
  assert.equal(message?.to, email);
  const verification = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email, code: message?.code, purpose: 'register' },
  });
  assert.equal(verification.statusCode, 200);
  return cookieFrom(verification.headers);
}

test('promo codes are created securely, redeemed once per user and counted in statistics', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-promos-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const mailer = new CaptureMailer();
  const store = new JsonAuthStore(config.dataFile);
  const app = await buildApp({ config, store, mailer, now: () => Date.UTC(2026, 7, 4, 12, 0, 0), logger: false });
  context.after(() => app.close());

  const unauthorizedCreate = await app.inject({
    method: 'POST',
    url: '/api/admin/promocodes',
    payload: { code: 'TEST100', rewardCoins: 100 },
  });
  assert.equal(unauthorizedCreate.statusCode, 401);

  const adminHeaders = { authorization: `Bearer ${config.promoAdminToken}` };
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/promocodes',
    headers: adminHeaders,
    payload: { code: ' test100 ', rewardCoins: 100, maxUses: 2, perUserLimit: 1, expiresAt: '2026-12-31T23:59:59Z' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().promoCode.code, 'TEST100');
  assert.equal(created.json().promoCode.usageCount, 0);

  const duplicateCreate = await app.inject({
    method: 'POST',
    url: '/api/admin/promocodes',
    headers: adminHeaders,
    payload: { code: 'TEST100', rewardCoins: 500 },
  });
  assert.equal(duplicateCreate.statusCode, 409);
  assert.equal(duplicateCreate.json().error.code, 'PROMO_CODE_EXISTS');

  const anonymousActivation = await app.inject({
    method: 'POST',
    url: '/api/promocodes/activate',
    payload: { code: 'TEST100' },
  });
  assert.equal(anonymousActivation.statusCode, 401);

  const firstCookie = await registerUser(app, mailer, 'first@example.com');
  const firstActivation = await app.inject({
    method: 'POST',
    url: '/api/promocodes/activate',
    headers: { cookie: firstCookie },
    payload: { code: 'test100' },
  });
  assert.equal(firstActivation.statusCode, 200);
  assert.equal(firstActivation.json().rewardCoins, 100);
  assert.equal(firstActivation.json().usageCount, 1);

  const repeatedActivation = await app.inject({
    method: 'POST',
    url: '/api/promocodes/activate',
    headers: { cookie: firstCookie },
    payload: { code: 'TEST100' },
  });
  assert.equal(repeatedActivation.statusCode, 409);
  assert.equal(repeatedActivation.json().error.code, 'PROMO_ALREADY_USED');

  const secondCookie = await registerUser(app, mailer, 'second@example.com');
  const secondActivation = await app.inject({
    method: 'POST',
    url: '/api/promocodes/activate',
    headers: { cookie: secondCookie },
    payload: { code: 'TEST100' },
  });
  assert.equal(secondActivation.statusCode, 200);

  const thirdCookie = await registerUser(app, mailer, 'third@example.com');
  const exhaustedActivation = await app.inject({
    method: 'POST',
    url: '/api/promocodes/activate',
    headers: { cookie: thirdCookie },
    payload: { code: 'TEST100' },
  });
  assert.equal(exhaustedActivation.statusCode, 409);
  assert.equal(exhaustedActivation.json().error.code, 'PROMO_LIMIT_REACHED');

  const statistics = await app.inject({ method: 'GET', url: '/api/admin/promocodes', headers: adminHeaders });
  assert.equal(statistics.statusCode, 200);
  assert.equal(statistics.json().promoCodes[0].usageCount, 2);
  assert.equal(statistics.json().promoCodes[0].uniqueUsers, 2);
  assert.equal(statistics.json().promoCodes[0].totalRewardedCoins, 200);
  assert.equal(statistics.json().promoCodes[0].remainingUses, 0);

  const database = await store.read((value) => value);
  assert.equal(database.promoCodes.length, 1);
  assert.equal(database.promoRedemptions.length, 2);
});
