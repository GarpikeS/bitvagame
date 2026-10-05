export type AuthPurpose = 'register' | 'login' | 'recovery';

export type GameEntitlementId =
  | 'royal:birthday'
  | 'karaoke:90s'
  | 'karaoke:girls'
  | 'karaoke:2000s'
  | 'karaoke:90-1'
  | 'karaoke:90-2'
  | 'karaoke:90-3'
  | 'karaoke:90-4'
  | 'karaoke:2000-1'
  | 'karaoke:2000-2'
  | 'karaoke:2000-3'
  | 'karaoke:2000-4'
  | 'karaoke:2010-1'
  | 'karaoke:2010-2'
  | 'karaoke:2010-3'
  | 'karaoke:2010-4';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: string;
  createdAt: string;
  balanceCoins?: number;
  purchasedBlanks?: BlankPurchaseRecord[];
  purchasedCategories?: string[];
  gameEntitlements?: GameEntitlementId[];
}

export interface BlankPurchaseRecord {
  id: string;
  category: string;
  count: number;
  date: string;
  packSeed: string;
  createdAt: string;
}

export interface ChallengeRecord {
  id: string;
  email: string;
  purpose: AuthPurpose;
  codeHash: string;
  expiresAt: string;
  createdAt: string;
  attempts: number;
  usedAt?: string;
  pendingName?: string;
  pendingPasswordHash?: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ResetGrantRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface PromoCodeRecord {
  id: string;
  code: string;
  rewardCoins: number;
  maxUses: number | null;
  perUserLimit: number;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface PromoRedemptionRecord {
  id: string;
  promoCodeId: string;
  code: string;
  userId: string;
  rewardCoins: number;
  createdAt: string;
}

export type PaymentStatus = 'CREATING' | 'CREATED' | 'APPROVED' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'ON-REFUND' | 'REFUNDED_PARTIALLY' | 'AUTHORIZED' | 'WAIT_FULL_PAYMENT';

export interface PaymentRecord {
  id: string;
  userId: string;
  provider: 'tochka';
  amount: number;
  status: PaymentStatus;
  paymentLinkId: string;
  providerOperationId?: string;
  paymentLink?: string;
  createdAt: string;
  updatedAt: string;
  creditedAt?: string;
  failureCode?: string;
}

export interface AuthDatabase {
  users: UserRecord[];
  challenges: ChallengeRecord[];
  sessions: SessionRecord[];
  resetGrants: ResetGrantRecord[];
  promoCodes: PromoCodeRecord[];
  promoRedemptions: PromoRedemptionRecord[];
  payments: PaymentRecord[];
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  balanceCoins: number;
  purchasedBlanks: BlankPurchaseRecord[];
  purchasedCategories: string[];
  gameEntitlements: GameEntitlementId[];
}
