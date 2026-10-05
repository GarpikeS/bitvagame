import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { JsonAuthStore } from './store.js';
import type { PromoCodeRecord, PromoRedemptionRecord } from './types.js';

export interface PromoCodeStats {
  id: string;
  code: string;
  rewardCoins: number;
  active: boolean;
  maxUses: number | null;
  perUserLimit: number;
  usageCount: number;
  uniqueUsers: number;
  totalRewardedCoins: number;
  remainingUses: number | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface CreatePromoInput {
  code?: unknown;
  rewardCoins?: unknown;
  maxUses?: unknown;
  perUserLimit?: unknown;
  expiresAt?: unknown;
}

function positiveInteger(value: unknown, field: string, fallback?: number): number {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, 'INVALID_PROMO_CONFIGURATION', `${field} должно быть положительным целым числом`);
  }
  return parsed;
}

export function normalizePromoCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function validatePromoCode(value: unknown): string {
  const code = normalizePromoCode(value);
  if (!/^[A-ZА-ЯЁ0-9_-]{4,32}$/u.test(code)) {
    throw new ApiError(400, 'INVALID_PROMO_CODE', 'Промокод должен содержать от 4 до 32 букв, цифр, дефисов или подчёркиваний');
  }
  return code;
}

function parseExpiration(value: unknown, now: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const timestamp = new Date(String(value)).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= now) {
    throw new ApiError(400, 'INVALID_PROMO_CONFIGURATION', 'Дата окончания должна быть в будущем');
  }
  return new Date(timestamp).toISOString();
}

function statsFor(code: PromoCodeRecord, redemptions: PromoRedemptionRecord[]): PromoCodeStats {
  const uses = redemptions.filter((item) => item.promoCodeId === code.id);
  const usageCount = uses.length;
  const lastUsedAt = uses.reduce<string | null>((latest, item) => {
    if (!latest || new Date(item.createdAt).getTime() > new Date(latest).getTime()) return item.createdAt;
    return latest;
  }, null);
  return {
    id: code.id,
    code: code.code,
    rewardCoins: code.rewardCoins,
    active: code.active,
    maxUses: code.maxUses,
    perUserLimit: code.perUserLimit,
    usageCount,
    uniqueUsers: new Set(uses.map((item) => item.userId)).size,
    totalRewardedCoins: uses.reduce((sum, item) => sum + item.rewardCoins, 0),
    remainingUses: code.maxUses === null ? null : Math.max(0, code.maxUses - usageCount),
    createdAt: code.createdAt,
    expiresAt: code.expiresAt || null,
    lastUsedAt,
  };
}

export class PromoService {
  constructor(
    private readonly store: JsonAuthStore,
    private readonly now: () => number = Date.now,
  ) {}

  async create(input: CreatePromoInput): Promise<PromoCodeStats> {
    const now = this.now();
    const code = validatePromoCode(input.code);
    const rewardCoins = positiveInteger(input.rewardCoins, 'Начисление');
    if (rewardCoins > 1_000_000) {
      throw new ApiError(400, 'INVALID_PROMO_CONFIGURATION', 'Начисление не может превышать 1 000 000 монет');
    }
    const maxUses = input.maxUses === undefined || input.maxUses === null || input.maxUses === ''
      ? null
      : positiveInteger(input.maxUses, 'Общий лимит');
    const perUserLimit = positiveInteger(input.perUserLimit, 'Лимит на пользователя', 1);
    if (maxUses !== null && perUserLimit > maxUses) {
      throw new ApiError(400, 'INVALID_PROMO_CONFIGURATION', 'Лимит на пользователя не может превышать общий лимит');
    }
    const expiresAt = parseExpiration(input.expiresAt, now);

    return this.store.mutate((database) => {
      if (database.promoCodes.some((item) => item.code === code)) {
        throw new ApiError(409, 'PROMO_CODE_EXISTS', 'Такой промокод уже существует');
      }
      const record: PromoCodeRecord = {
        id: randomUUID(),
        code,
        rewardCoins,
        maxUses,
        perUserLimit,
        active: true,
        createdAt: new Date(now).toISOString(),
        expiresAt,
      };
      database.promoCodes.push(record);
      return statsFor(record, database.promoRedemptions);
    });
  }

  async listStats(): Promise<PromoCodeStats[]> {
    return this.store.read((database) => database.promoCodes
      .map((code) => statsFor(code, database.promoRedemptions))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
  }

  async redeem(userId: string, codeValue: unknown): Promise<{
    code: string;
    rewardCoins: number;
    redeemedAt: string;
    usageCount: number;
    balanceCoins: number;
  }> {
    const code = validatePromoCode(codeValue);
    const now = this.now();
    return this.store.mutate((database) => {
      const promoCode = database.promoCodes.find((item) => item.code === code);
      if (!promoCode || !promoCode.active || (promoCode.expiresAt && new Date(promoCode.expiresAt).getTime() <= now)) {
        throw new ApiError(404, 'PROMO_NOT_AVAILABLE', 'Промокод не найден или больше не действует');
      }
      const uses = database.promoRedemptions.filter((item) => item.promoCodeId === promoCode.id);
      const userUses = uses.filter((item) => item.userId === userId).length;
      if (userUses >= promoCode.perUserLimit) {
        throw new ApiError(409, 'PROMO_ALREADY_USED', 'Вы уже активировали этот промокод');
      }
      if (promoCode.maxUses !== null && uses.length >= promoCode.maxUses) {
        throw new ApiError(409, 'PROMO_LIMIT_REACHED', 'Лимит активаций промокода закончился');
      }
      const redeemedAt = new Date(now).toISOString();
      database.promoRedemptions.push({
        id: randomUUID(),
        promoCodeId: promoCode.id,
        code: promoCode.code,
        userId,
        rewardCoins: promoCode.rewardCoins,
        createdAt: redeemedAt,
      });
      const user = database.users.find((item) => item.id === userId);
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      user.balanceCoins = Number(user.balanceCoins || 0) + promoCode.rewardCoins;
      return {
        code: promoCode.code,
        rewardCoins: promoCode.rewardCoins,
        redeemedAt,
        usageCount: uses.length + 1,
        balanceCoins: user.balanceCoins,
      };
    });
  }
}
