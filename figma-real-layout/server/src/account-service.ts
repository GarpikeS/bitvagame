import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { JsonAuthStore } from './store.js';
import type { BlankPurchaseRecord, GameEntitlementId, PublicUser, UserRecord } from './types.js';

const BLANK_MIN_COUNT = 2;
const BLANK_MAX_COUNT = 30;
const BLANK_UNIT_PRICE = 50;
const MUSIC_CATEGORY_PRICE = 100;
const MUSIC_CATEGORIES = ['Девичник', 'Хиты 90-х', 'Хиты 2000-х', 'Хиты караоке'];
const DEFAULT_UNLOCKED_MUSIC_CATEGORIES = ['Девичник', 'Хиты караоке'];
const GAME_ENTITLEMENT_CATALOG = {
  'royal:birthday': { priceCoins: 100 },
  'karaoke:90s': { priceCoins: 50 },
  'karaoke:girls': { priceCoins: 50 },
  'karaoke:2000s': { priceCoins: 50 },
  'karaoke:90-1': { priceCoins: 50 },
  'karaoke:90-2': { priceCoins: 50 },
  'karaoke:90-3': { priceCoins: 50 },
  'karaoke:90-4': { priceCoins: 50 },
  'karaoke:2000-1': { priceCoins: 50 },
  'karaoke:2000-2': { priceCoins: 50 },
  'karaoke:2000-3': { priceCoins: 50 },
  'karaoke:2000-4': { priceCoins: 50 },
  'karaoke:2010-1': { priceCoins: 50 },
  'karaoke:2010-2': { priceCoins: 50 },
  'karaoke:2010-3': { priceCoins: 50 },
  'karaoke:2010-4': { priceCoins: 50 },
} as const satisfies Record<GameEntitlementId, { priceCoins: number }>;

const PURCHASABLE_GAME_ENTITLEMENT_IDS: ReadonlySet<GameEntitlementId> = new Set([
  'royal:birthday',
  'karaoke:90s',
  'karaoke:girls',
  'karaoke:2000s',
  'karaoke:90-1',
  'karaoke:2000-1',
  'karaoke:2010-1',
]);

interface PurchaseBlanksInput {
  category: unknown;
  count: unknown;
}

interface PurchaseCategoryInput {
  category: unknown;
}

interface PurchaseGameEntitlementInput {
  entitlementId: unknown;
}

function normalizeBalance(value: unknown): number {
  const balance = Number(value || 0);
  return Number.isSafeInteger(balance) && balance > 0 ? balance : 0;
}

function cleanName(value: unknown): string {
  const name = String(value || '').trim();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, 'INVALID_NAME', 'Введите имя');
  return name;
}

function normalizeBlankCount(value: unknown): number {
  const count = Math.round(Number(value));
  if (!Number.isSafeInteger(count) || count < BLANK_MIN_COUNT || count > BLANK_MAX_COUNT) {
    throw new ApiError(400, 'INVALID_BLANK_COUNT', `Количество бланков должно быть от ${BLANK_MIN_COUNT} до ${BLANK_MAX_COUNT}`);
  }
  return count;
}

function normalizeMusicCategory(value: unknown): string {
  const category = String(value || '').trim();
  if (!MUSIC_CATEGORIES.includes(category)) {
    throw new ApiError(400, 'INVALID_MUSIC_CATEGORY', 'Выберите категорию');
  }
  return category;
}

function normalizePurchasedBlanks(value: unknown): BlankPurchaseRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Partial<BlankPurchaseRecord>;
      const count = Number(record.count);
      const category = String(record.category || '').trim();
      if (!MUSIC_CATEGORIES.includes(category) || !Number.isSafeInteger(count) || count < 1 || count > BLANK_MAX_COUNT) return null;
      return {
        id: String(record.id || randomUUID()),
        category,
        count,
        date: String(record.date || ''),
        packSeed: String(record.packSeed || record.id || randomUUID()),
        createdAt: String(record.createdAt || new Date(0).toISOString()),
      };
    })
    .filter((item): item is BlankPurchaseRecord => Boolean(item));
}

function normalizePurchasedCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter((item) => MUSIC_CATEGORIES.includes(item))));
}

function normalizeGameEntitlementId(value: unknown): GameEntitlementId {
  const entitlementId = String(value || '').trim();
  if (
    !Object.hasOwn(GAME_ENTITLEMENT_CATALOG, entitlementId)
    || !PURCHASABLE_GAME_ENTITLEMENT_IDS.has(entitlementId as GameEntitlementId)
  ) {
    throw new ApiError(400, 'INVALID_GAME_ENTITLEMENT', 'Выберите доступный игровой сборник');
  }
  return entitlementId as GameEntitlementId;
}

function normalizeGameEntitlements(value: unknown): GameEntitlementId[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => String(item || '').trim())
    .filter((item): item is GameEntitlementId => Object.hasOwn(GAME_ENTITLEMENT_CATALOG, item))));
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    balanceCoins: normalizeBalance(user.balanceCoins),
    purchasedBlanks: normalizePurchasedBlanks(user.purchasedBlanks),
    purchasedCategories: normalizePurchasedCategories(user.purchasedCategories),
    gameEntitlements: normalizeGameEntitlements(user.gameEntitlements),
  };
}

function purchaseDate(now: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(now));
}

export class AccountService {
  constructor(
    private readonly store: JsonAuthStore,
    private readonly now: () => number = Date.now,
  ) {}

  async updateProfile(userId: string, input: { name: unknown }): Promise<PublicUser> {
    const name = cleanName(input.name);
    return this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === userId);
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      user.name = name;
      return publicUser(user);
    });
  }

  async purchaseBlanks(userId: string, input: PurchaseBlanksInput): Promise<{ purchase: BlankPurchaseRecord; user: PublicUser }> {
    const category = normalizeMusicCategory(input.category);
    const count = normalizeBlankCount(input.count);
    const cost = count * BLANK_UNIT_PRICE;
    const now = this.now();
    const nowIso = new Date(now).toISOString();

    return this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === userId);
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      const balance = normalizeBalance(user.balanceCoins);
      if (balance < cost) {
        throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'Недостаточно монет на балансе');
      }
      const purchase: BlankPurchaseRecord = {
        id: randomUUID(),
        category,
        count,
        date: purchaseDate(now),
        packSeed: randomUUID(),
        createdAt: nowIso,
      };
      user.balanceCoins = balance - cost;
      user.purchasedBlanks = [...normalizePurchasedBlanks(user.purchasedBlanks), purchase];
      return { purchase, user: publicUser(user) };
    });
  }

  async purchaseCategory(userId: string, input: PurchaseCategoryInput): Promise<{ user: PublicUser }> {
    const category = normalizeMusicCategory(input.category);

    return this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === userId);
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      const categories = normalizePurchasedCategories(user.purchasedCategories);
      if (DEFAULT_UNLOCKED_MUSIC_CATEGORIES.includes(category) || categories.includes(category)) {
        user.purchasedCategories = categories;
        return { user: publicUser(user) };
      }
      const balance = normalizeBalance(user.balanceCoins);
      if (balance < MUSIC_CATEGORY_PRICE) {
        throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'Недостаточно монет на балансе');
      }
      user.balanceCoins = balance - MUSIC_CATEGORY_PRICE;
      user.purchasedCategories = [...categories, category];
      return { user: publicUser(user) };
    });
  }

  async purchaseGameEntitlement(userId: string, input: PurchaseGameEntitlementInput): Promise<{
    entitlementId: GameEntitlementId;
    priceCoins: number;
    chargedCoins: number;
    alreadyOwned: boolean;
    user: PublicUser;
  }> {
    const entitlementId = normalizeGameEntitlementId(input.entitlementId);
    const priceCoins = GAME_ENTITLEMENT_CATALOG[entitlementId].priceCoins;

    return this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === userId);
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден');
      const entitlements = normalizeGameEntitlements(user.gameEntitlements);
      if (entitlements.includes(entitlementId)) {
        user.gameEntitlements = entitlements;
        return {
          entitlementId,
          priceCoins,
          chargedCoins: 0,
          alreadyOwned: true,
          user: publicUser(user),
        };
      }
      const balance = normalizeBalance(user.balanceCoins);
      if (balance < priceCoins) {
        throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'Недостаточно монет на балансе');
      }
      user.balanceCoins = balance - priceCoins;
      user.gameEntitlements = [...entitlements, entitlementId];
      return {
        entitlementId,
        priceCoins,
        chargedCoins: priceCoins,
        alreadyOwned: false,
        user: publicUser(user),
      };
    });
  }
}
