import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { resolve } from 'node:path';
import { AccountService } from './account-service.js';
import { AuthService } from './auth-service.js';
import { loadConfig, type AuthConfig } from './config.js';
import { ApiError } from './errors.js';
import { ResendMailer, SmtpMailer, type AuthMailer } from './mailer.js';
import { PromoService } from './promo-service.js';
import { PaymentService } from './payment-service.js';
import { secretsMatch } from './security.js';
import { JsonAuthStore } from './store.js';
import { TochkaGateway, type PaymentGateway } from './tochka-gateway.js';
import type { AuthPurpose } from './types.js';

const SESSION_COOKIE = 'bitva_session';
const RESET_COOKIE = 'bitva_reset';

interface BuildAppOptions {
  config?: AuthConfig;
  store?: JsonAuthStore;
  mailer?: AuthMailer;
  now?: () => number;
  serveStatic?: boolean;
  logger?: boolean;
  paymentGateway?: PaymentGateway;
}

function bodyOf(request: { body?: unknown }): Record<string, unknown> {
  return request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config || loadConfig();
  const allowedOrigins = new Set(config.appOrigins);
  const app = Fastify({
    logger: options.logger ?? config.production,
    bodyLimit: 32 * 1024,
    trustProxy: config.production,
  });
  const store = options.store || new JsonAuthStore(config.dataFile);
  const smtpMailer = new SmtpMailer(config.smtp, config.emailFrom);
  const mailer = options.mailer || (smtpMailer.isConfigured
    ? smtpMailer
    : new ResendMailer(config.resendApiKey, config.emailFrom));
  const auth = new AuthService(config, store, mailer, options.now);
  const account = new AccountService(store, options.now);
  const promos = new PromoService(store, options.now);
  const tochkaConfig = config.tochka || {
    apiBaseUrl: 'https://enter.tochka.com/uapi',
    jwtToken: '',
    customerCode: '',
    merchantId: '',
    paymentModes: ['card', 'sbp'] as Array<'card' | 'sbp'>,
    returnUrl: `${config.appOrigin}/#/balance-top-up`,
    failReturnUrl: `${config.appOrigin}/#/balance-top-up`,
  };
  const paymentGateway = options.paymentGateway || new TochkaGateway(tochkaConfig);
  const payments = new PaymentService(store, paymentGateway, tochkaConfig, options.now);

  await app.register(cookie);
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Запрос с этого адреса запрещён');
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      if (error.retryAfter) reply.header('Retry-After', String(error.retryAfter));
      reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, retryAfter: error.retryAfter },
      });
      return;
    }
    app.log.error(error);
    const unexpected = error as { statusCode?: number; message?: string };
    const statusCode = typeof unexpected.statusCode === 'number' && unexpected.statusCode < 500 ? unexpected.statusCode : 500;
    reply.code(statusCode).send({
      error: { code: statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message: statusCode === 500 ? 'Внутренняя ошибка сервера' : unexpected.message || 'Некорректный запрос' },
    });
  });

  const setSessionCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.production,
      maxAge: config.sessionDays * 24 * 60 * 60,
    });
  };

  const setResetCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(RESET_COOKIE, token, {
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.production,
      maxAge: 10 * 60,
    });
  };

  const requirePromoAdmin = (authorization: string | undefined) => {
    if (!config.promoAdminToken) {
      throw new ApiError(503, 'PROMO_ADMIN_NOT_CONFIGURED', 'Управление промокодами не настроено');
    }
    const token = String(authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !secretsMatch(token, config.promoAdminToken)) {
      throw new ApiError(401, 'PROMO_ADMIN_UNAUTHORIZED', 'Неверный административный токен');
    }
  };

  app.get('/api/health', async () => {
    const paymentHealth = await payments.health();
    return {
      ok: true,
      emailConfigured: mailer.isConfigured,
      registrationVerificationConfigured: Boolean(config.fixedRegistrationCode || mailer.isConfigured),
      paymentConfigured: paymentHealth.configured,
      paymentReachable: paymentHealth.reachable,
      paymentHealthCode: paymentHealth.code,
    };
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = bodyOf(request);
    const result = await auth.requestRegistration({ name: body.name, email: body.email, password: body.password });
    reply.code(202).send({ ok: true, ...result });
  });

  app.post('/api/auth/login-code', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = bodyOf(request);
    const result = await auth.requestCode({ email: body.email, purpose: 'login' });
    reply.code(202).send({ ok: true, ...result });
  });

  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = bodyOf(request);
    const result = await auth.requestCode({ email: body.email, purpose: 'recovery' });
    reply.code(202).send({ ok: true, ...result });
  });

  app.post('/api/auth/verify-code', async (request, reply) => {
    const body = bodyOf(request);
    const purpose = String(body.purpose || '') as AuthPurpose;
    if (!['register', 'login', 'recovery'].includes(purpose)) {
      throw new ApiError(400, 'INVALID_PURPOSE', 'Неизвестный тип подтверждения');
    }
    const result = await auth.verifyCode({ email: body.email, code: body.code, purpose });
    if (result.sessionToken) setSessionCookie(reply, result.sessionToken);
    if (result.resetToken) setResetCookie(reply, result.resetToken);
    reply.send({ ok: true, purpose: result.purpose, user: result.user || null, resetReady: Boolean(result.resetToken) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = bodyOf(request);
    const result = await auth.loginWithPassword(body.email, body.password);
    setSessionCookie(reply, result.sessionToken);
    reply.send({ ok: true, user: result.user });
  });

  app.post('/api/auth/reset-password', async (request, reply) => {
    const body = bodyOf(request);
    await auth.resetPassword(request.cookies[RESET_COOKIE], body.password);
    reply.clearCookie(RESET_COOKIE, { path: '/api/auth' });
    reply.send({ ok: true });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await auth.logout(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/api/me', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход');
    reply.send({ user });
  });

  app.patch('/api/me', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход');
    reply.send({ ok: true, user: await account.updateProfile(user.id, { name: bodyOf(request).name }) });
  });

  app.post('/api/promocodes/activate', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для активации промокода');
    const result = await promos.redeem(user.id, bodyOf(request).code);
    reply.send({ ok: true, ...result });
  });

  app.post('/api/payments/tochka', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для оплаты');
    const payment = await payments.create(user.id, bodyOf(request).amount);
    reply.code(201).send({ payment });
  });

  app.get('/api/payments/:paymentId', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для проверки оплаты');
    const paymentId = String((request.params as { paymentId?: string }).paymentId || '');
    reply.send({ payment: await payments.refresh(user.id, paymentId) });
  });

  app.post('/api/purchases/blanks', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для покупки бланков');
    const result = await account.purchaseBlanks(user.id, bodyOf(request) as { category: unknown; count: unknown });
    reply.code(201).send({ ok: true, ...result });
  });

  app.post('/api/purchases/categories', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для покупки категории');
    reply.send({ ok: true, ...await account.purchaseCategory(user.id, { category: bodyOf(request).category }) });
  });

  app.post('/api/purchases/entitlements', async (request, reply) => {
    const user = await auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт для покупки игрового сборника');
    const result = await account.purchaseGameEntitlement(user.id, { entitlementId: bodyOf(request).entitlementId });
    reply.code(result.alreadyOwned ? 200 : 201).send({ ok: true, ...result });
  });

  app.post('/api/admin/promocodes', async (request, reply) => {
    requirePromoAdmin(request.headers.authorization);
    const promoCode = await promos.create(bodyOf(request));
    reply.code(201).send({ promoCode });
  });

  app.get('/api/admin/promocodes', async (request, reply) => {
    requirePromoAdmin(request.headers.authorization);
    reply.send({ promoCodes: await promos.listStats() });
  });

  if (options.serveStatic) {
    await app.register(fastifyStatic, { root: resolve('dist'), prefix: '/' });
  }

  return app;
}
