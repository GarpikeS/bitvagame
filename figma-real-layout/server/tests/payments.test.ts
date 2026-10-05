import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import type { AuthConfig, TochkaConfig } from '../src/config.js';
import type { AuthMailer, SendCodeMessage } from '../src/mailer.js';
import { JsonAuthStore } from '../src/store.js';
import { TochkaGateway, type CreateProviderPaymentInput, type PaymentGateway, type ProviderPayment } from '../src/tochka-gateway.js';

class CaptureMailer implements AuthMailer {
  isConfigured = true;
  messages: SendCodeMessage[] = [];
  async sendCode(message: SendCodeMessage): Promise<void> { this.messages.push(message); }
}

class FakeTochkaGateway implements PaymentGateway {
  isConfigured = true;
  created?: CreateProviderPaymentInput;
  status: ProviderPayment['status'] = 'CREATED';

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    this.created = input;
    return {
      operationId: 'operation-1',
      amount: input.amount,
      status: 'CREATED',
      paymentLink: 'https://payment.example/order-1',
      paymentLinkId: input.paymentLinkId,
    };
  }

  async getPayment(): Promise<ProviderPayment> {
    assert.ok(this.created);
    return {
      operationId: 'operation-1',
      amount: this.created.amount,
      status: this.status,
      paymentLink: 'https://payment.example/order-1',
      paymentLinkId: this.created.paymentLinkId,
    };
  }
}

class MismatchedTochkaGateway extends FakeTochkaGateway {
  override async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    const payment = await super.createPayment(input);
    return { ...payment, amount: input.amount + 1 };
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

test('Tochka health probe reports an untrusted CA without sending credentials or creating a payment', async () => {
  const config: TochkaConfig = {
    apiBaseUrl: 'https://enter.tochka.test/uapi',
    jwtToken: 'must-not-be-sent-by-health-probe',
    customerCode: 'customer',
    merchantId: 'merchant',
    paymentModes: ['card'],
    returnUrl: 'https://example.test/payment-return',
    failReturnUrl: 'https://example.test/payment-failed',
  };
  let observedUrl = '';
  let observedInit: RequestInit | undefined;
  const tlsError = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' },
  });
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    observedUrl = String(url);
    observedInit = init;
    throw tlsError;
  }) as typeof fetch;

  const health = await new TochkaGateway(config, fetcher).checkHealth();

  assert.deepEqual(health, { reachable: false, code: 'TLS_CA_UNTRUSTED' });
  assert.equal(observedUrl, config.apiBaseUrl);
  assert.equal(observedInit?.method, 'HEAD');
  assert.equal((observedInit?.headers as Record<string, string> | undefined)?.Authorization, undefined);

  await assert.rejects(
    () => new TochkaGateway(config, fetcher).createPayment({
      amount: 100,
      userId: 'user-1',
      paymentLinkId: 'payment-1',
      redirectUrl: config.returnUrl,
      failRedirectUrl: config.failReturnUrl,
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === 'object'
      && (error as { code?: string }).code === 'PAYMENT_PROVIDER_TLS_ERROR',
    ),
  );
});

test('Tochka payment credits the server balance once after verified approval', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-payments-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const mailer = new CaptureMailer();
  const gateway = new FakeTochkaGateway();
  const store = new JsonAuthStore(config.dataFile);
  const app = await buildApp({ config, store, mailer, paymentGateway: gateway, logger: false });
  context.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Покупатель', email: 'buyer@example.com', password: 'Password123' },
  });
  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'buyer@example.com', code: mailer.messages[0]?.code, purpose: 'register' },
  });
  const cookie = sessionCookie(verified.headers);

  const create = await app.inject({
    method: 'POST',
    url: '/api/payments/tochka',
    headers: { cookie },
    payload: { amount: 100 },
  });
  assert.equal(create.statusCode, 201);
  assert.equal(create.json().payment.status, 'CREATED');
  assert.equal(create.json().payment.paymentLink, 'https://payment.example/order-1');
  assert.match(gateway.created?.redirectUrl || '', /paymentId=/);

  const pending = await app.inject({ method: 'GET', url: `/api/payments/${create.json().payment.id}`, headers: { cookie } });
  assert.equal(pending.statusCode, 200);
  assert.equal(pending.json().payment.balanceCoins, 0);

  gateway.status = 'APPROVED';
  const approved = await app.inject({ method: 'GET', url: `/api/payments/${create.json().payment.id}`, headers: { cookie } });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().payment.balanceCoins, 100);
  assert.equal(approved.json().payment.credited, true);

  const repeated = await app.inject({ method: 'GET', url: `/api/payments/${create.json().payment.id}`, headers: { cookie } });
  assert.equal(repeated.json().payment.balanceCoins, 100);
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.json().user.balanceCoins, 100);
});

test('invalid provider response finalizes the local payment as failed', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-payments-mismatch-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const mailer = new CaptureMailer();
  const gateway = new MismatchedTochkaGateway();
  const store = new JsonAuthStore(config.dataFile);
  const app = await buildApp({ config, store, mailer, paymentGateway: gateway, logger: false });
  context.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Покупатель', email: 'mismatch@example.com', password: 'Password123' },
  });
  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-code',
    payload: { email: 'mismatch@example.com', code: mailer.messages[0]?.code, purpose: 'register' },
  });
  const cookie = sessionCookie(verified.headers);

  const create = await app.inject({
    method: 'POST',
    url: '/api/payments/tochka',
    headers: { cookie },
    payload: { amount: 100 },
  });

  assert.equal(create.statusCode, 502);
  assert.equal(create.json().error.code, 'PAYMENT_PROVIDER_MISMATCH');
  const payment = await store.read((database) => database.payments[0]);
  assert.equal(payment?.status, 'FAILED');
  assert.equal(payment?.failureCode, 'PAYMENT_PROVIDER_MISMATCH');
});

test('payment endpoint rejects anonymous and invalid amounts before provider call', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'bitva-payments-validation-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = configFor(join(directory, 'auth.json'));
  const gateway = new FakeTochkaGateway();
  const app = await buildApp({ config, paymentGateway: gateway, logger: false });
  context.after(() => app.close());

  const anonymous = await app.inject({ method: 'POST', url: '/api/payments/tochka', payload: { amount: 100 } });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(gateway.created, undefined);
});
