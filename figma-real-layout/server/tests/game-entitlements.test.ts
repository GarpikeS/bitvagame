import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import type { AuthMailer, SendCodeMessage } from '../src/mailer.js';
import { JsonAuthStore } from '../src/store.js';
import type { GameEntitlementId } from '../src/types.js';

const LAYOUT7_KARAOKE_ENTITLEMENTS = [
  'karaoke:90-1',
  'karaoke:2000-1',
  'karaoke:2010-1',
] as const satisfies readonly GameEntitlementId[];

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

function sessionCookie(headers: Record<string, unknown>): string {
  const source = headers['set-cookie'];
  const values = Array.isArray(source) ? source : [source];
  const cookie = values.find((value) => String(value).startsWith('bitva_session='));
  assert.ok(cookie);
  return String(cookie).split(';')[0];
}

async function createBuyer(context: TestContext, balanceCoins: number) {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-game-entitlements-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const mailer = new CaptureMailer();
  const store = new JsonAuthStore(config.dataFile);
  const app = await buildApp({ config, store, mailer, logger: false });
  context.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Варя', email: 'royal-buyer@example.com', password: 'Password123' },
  });
  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'royal-buyer@example.com', code: mailer.messages[0]?.code, purpose: 'register' },
  });
  const cookie = sessionCookie(verified.headers);

  await store.mutate((database) => {
    const user = database.users.find((item) => item.email === 'royal-buyer@example.com');
    assert.ok(user);
    user.balanceCoins = balanceCoins;
  });

  return { app, cookie, store };
}

test('game entitlement purchase rejects anonymous, unknown and underfunded requests without changing account state', async (context) => {
  const { app, cookie } = await createBuyer(context, 99);

  const anonymous = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    payload: { entitlementId: 'royal:birthday' },
  });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().error.code, 'UNAUTHORIZED');

  const unknown = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'royal:unknown' },
  });
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.json().error.code, 'INVALID_GAME_ENTITLEMENT');

  const insufficient = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'royal:birthday' },
  });
  assert.equal(insufficient.statusCode, 409);
  assert.equal(insufficient.json().error.code, 'INSUFFICIENT_FUNDS');

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.json().user.balanceCoins, 99);
  assert.deepEqual(me.json().user.gameEntitlements, []);
  assert.deepEqual(me.json().user.purchasedCategories, []);
});

test('game entitlement purchase charges once and stays separate from music categories across login sessions', async (context) => {
  const { app, cookie } = await createBuyer(context, 200);

  const responses = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/purchases/entitlements',
      headers: { cookie },
      payload: { entitlementId: 'royal:birthday' },
    }),
    app.inject({
      method: 'POST',
      url: '/api/purchases/entitlements',
      headers: { cookie },
      payload: { entitlementId: 'royal:birthday' },
    }),
  ]);

  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 201]);
  assert.deepEqual(responses.map((response) => response.json().chargedCoins).sort((left, right) => left - right), [0, 100]);
  assert.deepEqual(responses.map((response) => response.json().alreadyOwned).sort(), [false, true]);

  const successfulPurchase = responses.find((response) => response.statusCode === 201)?.json();
  assert.equal(successfulPurchase.entitlementId, 'royal:birthday');
  assert.equal(successfulPurchase.priceCoins, 100);
  assert.equal(successfulPurchase.user.balanceCoins, 100);
  assert.deepEqual(successfulPurchase.user.gameEntitlements, ['royal:birthday']);
  assert.deepEqual(successfulPurchase.user.purchasedCategories, []);

  const musicCategory = await app.inject({
    method: 'POST',
    url: '/api/purchases/categories',
    headers: { cookie },
    payload: { category: 'Хиты 90-х' },
  });
  assert.equal(musicCategory.statusCode, 200);
  assert.equal(musicCategory.json().user.balanceCoins, 0);
  assert.deepEqual(musicCategory.json().user.gameEntitlements, ['royal:birthday']);
  assert.deepEqual(musicCategory.json().user.purchasedCategories, ['Хиты 90-х']);

  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'royal-buyer@example.com', password: 'Password123' },
  });
  assert.equal(login.statusCode, 200);
  const nextCookie = sessionCookie(login.headers);

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: nextCookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.balanceCoins, 0);
  assert.deepEqual(me.json().user.gameEntitlements, ['royal:birthday']);
  assert.deepEqual(me.json().user.purchasedCategories, ['Хиты 90-х']);
});

test('karaoke battle entitlements use their own Figma prices and remain idempotent', async (context) => {
  const { app, cookie } = await createBuyer(context, 150);

  const hits = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'karaoke:90s' },
  });
  assert.equal(hits.statusCode, 201);
  assert.equal(hits.json().priceCoins, 50);
  assert.equal(hits.json().chargedCoins, 50);
  assert.equal(hits.json().user.balanceCoins, 100);

  const girls = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'karaoke:girls' },
  });
  assert.equal(girls.statusCode, 201);
  assert.equal(girls.json().priceCoins, 50);
  assert.equal(girls.json().chargedCoins, 50);
  assert.equal(girls.json().user.balanceCoins, 50);
  assert.deepEqual(girls.json().user.gameEntitlements, ['karaoke:90s', 'karaoke:girls']);
  assert.deepEqual(girls.json().user.purchasedCategories, []);

  const repeat = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'karaoke:girls' },
  });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.json().chargedCoins, 0);
  assert.equal(repeat.json().alreadyOwned, true);
  assert.equal(repeat.json().user.balanceCoins, 50);

  const twoThousands = await app.inject({
    method: 'POST',
    url: '/api/purchases/entitlements',
    headers: { cookie },
    payload: { entitlementId: 'karaoke:2000s' },
  });
  assert.equal(twoThousands.statusCode, 201);
  assert.equal(twoThousands.json().priceCoins, 50);
  assert.equal(twoThousands.json().user.balanceCoins, 0);
  assert.deepEqual(twoThousands.json().user.gameEntitlements, ['karaoke:90s', 'karaoke:girls', 'karaoke:2000s']);
});

test('available layout 7 karaoke packs each cost 50 coins', async (context) => {
  const packPriceCoins = 50;
  const { app, cookie } = await createBuyer(context, LAYOUT7_KARAOKE_ENTITLEMENTS.length * packPriceCoins);

  for (const [index, entitlementId] of LAYOUT7_KARAOKE_ENTITLEMENTS.entries()) {
    const purchase = await app.inject({
      method: 'POST',
      url: '/api/purchases/entitlements',
      headers: { cookie },
      payload: { entitlementId },
    });

    assert.equal(purchase.statusCode, 201, entitlementId);
    assert.equal(purchase.json().entitlementId, entitlementId);
    assert.equal(purchase.json().priceCoins, packPriceCoins);
    assert.equal(purchase.json().chargedCoins, packPriceCoins);
    assert.equal(
      purchase.json().user.balanceCoins,
      (LAYOUT7_KARAOKE_ENTITLEMENTS.length - index - 1) * packPriceCoins,
    );
  }

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.balanceCoins, 0);
  assert.deepEqual(me.json().user.gameEntitlements, LAYOUT7_KARAOKE_ENTITLEMENTS);
});

test('retired layout 7 packs cannot be purchased but an existing entitlement is preserved', async (context) => {
  const { app, cookie, store } = await createBuyer(context, 100);

  await store.mutate((database) => {
    const user = database.users.find((item) => item.email === 'royal-buyer@example.com');
    assert.ok(user);
    user.gameEntitlements = ['karaoke:90-2'];
  });

  const retiredEntitlementIds = [
    'karaoke:90-2',
    'karaoke:90-3',
    'karaoke:90-4',
    'karaoke:2000-2',
    'karaoke:2000-3',
    'karaoke:2000-4',
    'karaoke:2010-2',
    'karaoke:2010-3',
    'karaoke:2010-4',
  ];
  for (const entitlementId of retiredEntitlementIds) {
    const unavailablePurchase = await app.inject({
      method: 'POST',
      url: '/api/purchases/entitlements',
      headers: { cookie },
      payload: { entitlementId },
    });
    assert.equal(unavailablePurchase.statusCode, 400);
    assert.equal(unavailablePurchase.json().error.code, 'INVALID_GAME_ENTITLEMENT');
  }

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.balanceCoins, 100);
  assert.deepEqual(me.json().user.gameEntitlements, ['karaoke:90-2']);
});
