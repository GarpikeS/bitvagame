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
  async sendCode(message: SendCodeMessage): Promise<void> { this.messages.push(message); }
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

function sessionCookie(headers: Record<string, unknown>): string {
  const source = headers['set-cookie'];
  const values = Array.isArray(source) ? source : [source];
  const cookie = values.find((value) => String(value).startsWith('bitva_session='));
  assert.ok(cookie);
  return String(cookie).split(';')[0];
}

test('profile name, balance and blank purchases persist after logout and password login', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-account-state-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const mailer = new CaptureMailer();
  const store = new JsonAuthStore(config.dataFile);
  const app = await buildApp({ config, store, mailer, logger: false });
  context.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Варя', email: 'buyer@example.com', password: 'Password123' },
  });
  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'buyer@example.com', code: mailer.messages[0]?.code, purpose: 'register' },
  });
  const cookie = sessionCookie(verified.headers);

  await store.mutate((database) => {
    const user = database.users.find((item) => item.email === 'buyer@example.com');
    assert.ok(user);
    user.balanceCoins = 200;
  });

  const rename = await app.inject({
    method: 'PATCH',
    url: '/api/me',
    headers: { cookie },
    payload: { name: 'Варвара' },
  });
  assert.equal(rename.statusCode, 200);
  assert.equal(rename.json().user.name, 'Варвара');

  const purchase = await app.inject({
    method: 'POST',
    url: '/api/purchases/blanks',
    headers: { cookie },
    payload: { category: 'Девичник', count: 2 },
  });
  assert.equal(purchase.statusCode, 201);
  assert.equal(purchase.json().user.balanceCoins, 100);
  assert.equal(purchase.json().user.purchasedBlanks.length, 1);
  assert.equal(purchase.json().user.purchasedBlanks[0].category, 'Девичник');
  assert.equal(purchase.json().user.purchasedBlanks[0].count, 2);

  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'buyer@example.com', password: 'Password123' },
  });
  const nextCookie = sessionCookie(login.headers);
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: nextCookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.name, 'Варвара');
  assert.equal(me.json().user.balanceCoins, 100);
  assert.equal(me.json().user.purchasedBlanks.length, 1);
});
