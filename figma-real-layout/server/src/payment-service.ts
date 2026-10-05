import { randomUUID } from 'node:crypto';
import type { TochkaConfig } from './config.js';
import { ApiError } from './errors.js';
import type { PaymentGateway, ProviderPayment } from './tochka-gateway.js';
import { JsonAuthStore } from './store.js';
import type { PaymentRecord, PaymentStatus } from './types.js';

const MAX_TOP_UP = 1_500;

function integerAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TOP_UP) {
    throw new ApiError(400, 'INVALID_PAYMENT_AMOUNT', `Сумма пополнения должна быть от 1 до ${MAX_TOP_UP} рублей`);
  }
  return amount;
}

function paymentUrl(baseUrl: string, paymentId: string, result: 'success' | 'failed'): string {
  const url = new URL(baseUrl);
  url.searchParams.set('paymentId', paymentId);
  url.searchParams.set('paymentResult', result);
  return url.toString();
}

function publicPayment(record: PaymentRecord, balanceCoins?: number) {
  return {
    id: record.id,
    amount: record.amount,
    status: record.status,
    paymentLink: record.paymentLink || null,
    createdAt: record.createdAt,
    credited: Boolean(record.creditedAt),
    ...(balanceCoins === undefined ? {} : { balanceCoins }),
  };
}

export class PaymentService {
  constructor(
    private readonly store: JsonAuthStore,
    private readonly gateway: PaymentGateway,
    private readonly config: TochkaConfig,
    private readonly now: () => number = Date.now,
  ) {}

  get isConfigured(): boolean {
    return this.gateway.isConfigured;
  }

  async health() {
    if (!this.gateway.isConfigured) {
      return { configured: false, reachable: false, code: 'NOT_CONFIGURED' as const };
    }
    if (!this.gateway.checkHealth) {
      return { configured: true, reachable: null, code: 'NOT_CHECKED' as const };
    }
    const result = await this.gateway.checkHealth();
    return { configured: true, ...result };
  }

  async create(userId: string, amountValue: unknown) {
    if (!this.gateway.isConfigured) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Оплата пока не настроена');
    const amount = integerAmount(amountValue);
    const now = new Date(this.now()).toISOString();
    const id = randomUUID();
    const paymentLinkId = `bitva-${id.replace(/-/g, '')}`;
    const record: PaymentRecord = {
      id,
      userId,
      provider: 'tochka',
      amount,
      status: 'CREATING',
      paymentLinkId,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.mutate((database) => {
      if (!database.users.some((item) => item.id === userId)) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      database.payments.push(record);
    });

    try {
      const providerPayment: ProviderPayment = await this.gateway.createPayment({
        amount,
        userId,
        paymentLinkId,
        redirectUrl: paymentUrl(this.config.returnUrl, id, 'success'),
        failRedirectUrl: paymentUrl(this.config.failReturnUrl, id, 'failed'),
      });

      if (providerPayment.paymentLinkId && providerPayment.paymentLinkId !== paymentLinkId) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_MISMATCH', 'Точка вернула другой номер заказа');
      }
      if (providerPayment.amount !== amount || !providerPayment.paymentLink) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_MISMATCH', 'Точка вернула неверную сумму или ссылку платежа');
      }

      return await this.store.mutate((database) => {
        const payment = database.payments.find((item) => item.id === id);
        if (!payment) throw new ApiError(500, 'PAYMENT_NOT_FOUND', 'Платёж не найден');
        payment.providerOperationId = providerPayment.operationId;
        payment.paymentLink = providerPayment.paymentLink;
        payment.status = providerPayment.status;
        payment.updatedAt = new Date(this.now()).toISOString();
        return publicPayment(payment);
      });
    } catch (error) {
      await this.store.mutate((database) => {
        const payment = database.payments.find((item) => item.id === id);
        if (payment) {
          payment.status = 'FAILED';
          payment.failureCode = error instanceof ApiError ? error.code : 'PAYMENT_PROVIDER_UNAVAILABLE';
          payment.updatedAt = new Date(this.now()).toISOString();
        }
      });
      throw error;
    }
  }

  async refresh(userId: string, paymentId: string) {
    const stored = await this.store.read((database) => database.payments.find((item) => item.id === paymentId && item.userId === userId));
    if (!stored) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Платёж не найден');
    if (!stored.providerOperationId || stored.status === 'FAILED') {
      return publicPayment(stored);
    }

    const providerPayment = await this.gateway.getPayment(stored.providerOperationId);
    if (
      providerPayment.operationId !== stored.providerOperationId
      || providerPayment.amount !== stored.amount
      || (providerPayment.paymentLinkId && providerPayment.paymentLinkId !== stored.paymentLinkId)
      || (providerPayment.customerCode && providerPayment.customerCode !== this.config.customerCode)
      || (this.config.merchantId && providerPayment.merchantId && providerPayment.merchantId !== this.config.merchantId)
    ) {
      throw new ApiError(502, 'PAYMENT_PROVIDER_MISMATCH', 'Данные платежа не совпали с заказом');
    }

    return this.store.mutate((database) => {
      const payment = database.payments.find((item) => item.id === stored.id && item.userId === userId);
      const user = database.users.find((item) => item.id === userId);
      if (!payment || !user) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Платёж не найден');
      payment.status = providerPayment.status as PaymentStatus;
      payment.updatedAt = new Date(this.now()).toISOString();
      if (payment.status === 'APPROVED' && !payment.creditedAt) {
        user.balanceCoins = Number(user.balanceCoins || 0) + payment.amount;
        payment.creditedAt = payment.updatedAt;
      }
      return publicPayment(payment, Number(user.balanceCoins || 0));
    });
  }
}
