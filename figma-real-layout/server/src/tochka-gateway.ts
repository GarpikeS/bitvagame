import type { TochkaConfig } from './config.js';
import { ApiError } from './errors.js';
import type { PaymentStatus } from './types.js';

export interface CreateProviderPaymentInput {
  amount: number;
  userId: string;
  paymentLinkId: string;
  redirectUrl: string;
  failRedirectUrl: string;
}

export interface ProviderPayment {
  operationId: string;
  amount: number;
  status: PaymentStatus;
  paymentLink: string;
  paymentLinkId: string;
  customerCode?: string;
  merchantId?: string;
}

export interface PaymentGateway {
  readonly isConfigured: boolean;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPayment(operationId: string): Promise<ProviderPayment>;
  checkHealth?(): Promise<PaymentGatewayHealth>;
}

export interface PaymentGatewayHealth {
  reachable: boolean;
  code: 'OK' | 'NOT_CONFIGURED' | 'TLS_CA_UNTRUSTED' | 'TIMEOUT' | 'NETWORK_ERROR';
}

const TLS_TRUST_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function connectionFailureCode(error: unknown): PaymentGatewayHealth['code'] {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = source.cause && typeof source.cause === 'object'
    ? source.cause as Record<string, unknown>
    : {};
  const code = String(cause.code || source.code || '').toUpperCase();
  const name = String(cause.name || source.name || '').toUpperCase();
  if (TLS_TRUST_ERROR_CODES.has(code)) return 'TLS_CA_UNTRUSTED';
  if (name === 'ABORTERROR' || code.includes('TIMEOUT')) return 'TIMEOUT';
  return 'NETWORK_ERROR';
}

const PAYMENT_STATUSES = new Set<PaymentStatus>([
  'CREATED',
  'APPROVED',
  'ON-REFUND',
  'REFUNDED',
  'EXPIRED',
  'REFUNDED_PARTIALLY',
  'AUTHORIZED',
  'WAIT_FULL_PAYMENT',
]);

function providerError(status: number, payload: unknown): ApiError {
  const providerMessage = payload && typeof payload === 'object'
    ? String((payload as Record<string, unknown>).message || (payload as Record<string, unknown>).Message || '')
    : '';
  if (status === 401 || status === 403) {
    return new ApiError(503, 'PAYMENT_PROVIDER_FORBIDDEN', 'Точка не разрешила операцию: проверьте права интернет-эквайринга у JWT');
  }
  if (status === 400) return new ApiError(502, 'PAYMENT_PROVIDER_REJECTED', providerMessage || 'Точка отклонила параметры платежа');
  return new ApiError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Платёжный сервис временно недоступен');
}

function asPayment(value: unknown): ProviderPayment {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawStatus = String(data.status || 'CREATED');
  if (!PAYMENT_STATUSES.has(rawStatus as PaymentStatus)) {
    throw new ApiError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Точка вернула неизвестный статус платежа');
  }
  const operationId = String(data.operationId || '');
  const paymentLink = String(data.paymentLink || '');
  const paymentLinkId = String(data.paymentLinkId || '');
  const amount = Number(data.amount);
  if (!operationId || !Number.isFinite(amount)) {
    throw new ApiError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Точка вернула неполные данные платежа');
  }
  return {
    operationId,
    amount,
    status: rawStatus as PaymentStatus,
    paymentLink,
    paymentLinkId,
    customerCode: data.customerCode ? String(data.customerCode) : undefined,
    merchantId: data.merchantId ? String(data.merchantId) : undefined,
  };
}

export class TochkaGateway implements PaymentGateway {
  readonly isConfigured: boolean;
  private healthCache?: { expiresAt: number; result: PaymentGatewayHealth };

  constructor(
    private readonly config: TochkaConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.isConfigured = Boolean(config.jwtToken && config.customerCode && config.merchantId && config.paymentModes.length);
  }

  async checkHealth(): Promise<PaymentGatewayHealth> {
    if (!this.isConfigured) return { reachable: false, code: 'NOT_CONFIGURED' };
    if (this.healthCache && this.healthCache.expiresAt > Date.now()) return this.healthCache.result;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      // Any HTTP response is sufficient here: this probe checks DNS/TCP/TLS only
      // and intentionally never creates a payment or sends provider credentials.
      await this.fetcher(this.config.apiBaseUrl.replace(/\/$/, ''), {
        method: 'HEAD',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const result: PaymentGatewayHealth = { reachable: true, code: 'OK' };
      this.healthCache = { expiresAt: Date.now() + 60_000, result };
      return result;
    } catch (error) {
      const result: PaymentGatewayHealth = { reachable: false, code: connectionFailureCode(error) };
      this.healthCache = { expiresAt: Date.now() + 15_000, result };
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.jwtToken}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      const failureCode = connectionFailureCode(error);
      if (failureCode === 'TLS_CA_UNTRUSTED') {
        throw new ApiError(503, 'PAYMENT_PROVIDER_TLS_ERROR', 'Не удалось проверить защищённое соединение с платёжным сервисом');
      }
      if (failureCode === 'TIMEOUT') {
        throw new ApiError(504, 'PAYMENT_PROVIDER_TIMEOUT', 'Платёжный сервис не ответил вовремя');
      }
      throw new ApiError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Не удалось связаться с платёжным сервисом');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(response.status, payload);
    return payload as Record<string, unknown>;
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    if (!this.isConfigured) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Оплата пока не настроена');
    const response = await this.request('/acquiring/v1.0/payments', {
      method: 'POST',
      body: JSON.stringify({
        Data: {
          customerCode: this.config.customerCode,
          amount: input.amount,
          purpose: 'Пополнение баланса Битва игр',
          redirectUrl: input.redirectUrl,
          failRedirectUrl: input.failRedirectUrl,
          paymentMode: this.config.paymentModes,
          consumerId: input.userId,
          merchantId: this.config.merchantId,
          preAuthorization: false,
          ttl: 60,
          paymentLinkId: input.paymentLinkId,
        },
      }),
    });
    return asPayment(response.Data);
  }

  async getPayment(operationId: string): Promise<ProviderPayment> {
    if (!this.isConfigured) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Оплата пока не настроена');
    const response = await this.request(`/acquiring/v1.0/payments/${encodeURIComponent(operationId)}`);
    const operation = (response.Data as { Operation?: unknown[] } | undefined)?.Operation?.[0];
    return asPayment(operation);
  }
}
