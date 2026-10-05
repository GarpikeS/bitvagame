import { resolve } from 'node:path';

export interface AuthConfig {
  port: number;
  host: string;
  production: boolean;
  appOrigin: string;
  appOrigins: string[];
  authSecret: string;
  dataFile: string;
  resendApiKey: string;
  emailFrom: string;
  smtp?: SmtpConfig;
  sessionDays: number;
  codeLifetimeMinutes: number;
  codeCooldownSeconds: number;
  maxCodeAttempts: number;
  maxEmailsPerHour: number;
  fixedRegistrationCode?: string;
  promoAdminToken: string;
  tochka?: TochkaConfig;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface TochkaConfig {
  apiBaseUrl: string;
  jwtToken: string;
  customerCode: string;
  merchantId: string;
  paymentModes: Array<'card' | 'sbp' | 'tinkoff' | 'dolyame'>;
  returnUrl: string;
  failReturnUrl: string;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = environment.NODE_ENV === 'production';
  const authSecret = environment.AUTH_SECRET || (production ? '' : 'local-development-secret-change-before-production');
  if (production && authSecret.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters in production');
  }
  const appOrigin = environment.APP_ORIGIN || 'http://127.0.0.1:5173';
  const appOrigins = Array.from(new Set([
    appOrigin,
    ...String(environment.APP_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]));
  const smtpPort = positiveNumber(environment.SMTP_PORT, 465);
  const smtpUser = environment.SMTP_USER || '';
  const smtpPassword = environment.SMTP_PASSWORD || '';
  const fixedRegistrationCode = /^\d{6}$/.test(environment.AUTH_FIXED_REGISTRATION_CODE || '')
    ? environment.AUTH_FIXED_REGISTRATION_CODE
    : undefined;
  const paymentModes = String(environment.TOCHKA_PAYMENT_MODES || 'card,sbp')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is TochkaConfig['paymentModes'][number] => ['card', 'sbp', 'tinkoff', 'dolyame'].includes(item));
  return {
    port: positiveNumber(environment.PORT, 8787),
    host: environment.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    production,
    appOrigin,
    appOrigins,
    authSecret,
    dataFile: resolve(environment.AUTH_DATA_FILE || 'server-data/auth.json'),
    resendApiKey: environment.RESEND_API_KEY || '',
    emailFrom: environment.EMAIL_FROM || '',
    smtp: smtpUser || smtpPassword ? {
      host: environment.SMTP_HOST || 'smtp.yandex.ru',
      port: smtpPort,
      secure: booleanValue(environment.SMTP_SECURE, smtpPort === 465),
      user: smtpUser,
      password: smtpPassword,
    } : undefined,
    sessionDays: positiveNumber(environment.SESSION_DAYS, 30),
    codeLifetimeMinutes: positiveNumber(environment.CODE_LIFETIME_MINUTES, 10),
    codeCooldownSeconds: positiveNumber(environment.CODE_COOLDOWN_SECONDS, 60),
    maxCodeAttempts: positiveNumber(environment.MAX_CODE_ATTEMPTS, 5),
    maxEmailsPerHour: positiveNumber(environment.MAX_EMAILS_PER_HOUR, 5),
    fixedRegistrationCode,
    promoAdminToken: environment.PROMO_ADMIN_TOKEN || '',
    tochka: {
      apiBaseUrl: environment.TOCHKA_API_BASE_URL || 'https://enter.tochka.com/uapi',
      jwtToken: environment.TOCHKA_JWT_TOKEN || '',
      customerCode: environment.TOCHKA_CUSTOMER_CODE || '',
      merchantId: environment.TOCHKA_MERCHANT_ID || '',
      paymentModes: paymentModes.length ? paymentModes : ['card', 'sbp'],
      returnUrl: environment.TOCHKA_RETURN_URL || `${appOrigin}/#/balance-top-up`,
      failReturnUrl: environment.TOCHKA_FAIL_RETURN_URL || `${appOrigin}/#/balance-top-up`,
    },
  };
}
