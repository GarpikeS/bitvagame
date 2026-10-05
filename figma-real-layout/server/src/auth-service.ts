import { randomUUID } from 'node:crypto';
import type { AuthConfig } from './config.js';
import { ApiError } from './errors.js';
import { EmailNotConfiguredError, type AuthMailer } from './mailer.js';
import { createCode, createToken, hashPassword, hashSecret, isValidEmail, isValidPassword, normalizeEmail, secretsMatch, verifyPassword } from './security.js';
import { JsonAuthStore } from './store.js';
import { publicUser } from './account-service.js';
import type { AuthDatabase, AuthPurpose, PublicUser } from './types.js';

interface RegistrationInput { name: unknown; email: unknown; password: unknown }
interface CodeRequestInput { email: unknown; purpose: Exclude<AuthPurpose, 'register'> }
interface VerifyInput { email: unknown; code: unknown; purpose: AuthPurpose }

export interface VerifyResult {
  purpose: AuthPurpose;
  user?: PublicUser;
  sessionToken?: string;
  resetToken?: string;
}

export class AuthService {
  constructor(
    private readonly config: AuthConfig,
    private readonly store: JsonAuthStore,
    private readonly mailer: AuthMailer,
    private readonly now: () => number = Date.now,
  ) {}

  private cleanup(database: AuthDatabase, now: number): void {
    const challengeCutoff = now - 24 * 60 * 60 * 1000;
    database.challenges = database.challenges.filter((item) => new Date(item.createdAt).getTime() > challengeCutoff);
    database.sessions = database.sessions.filter((item) => new Date(item.expiresAt).getTime() > now);
    database.resetGrants = database.resetGrants.filter((item) => new Date(item.expiresAt).getTime() > now && !item.usedAt);
  }

  private codeHash(email: string, purpose: AuthPurpose, code: string): string {
    return hashSecret(`${purpose}:${email}:${code}`, this.config.authSecret);
  }

  private sessionHash(token: string): string {
    return hashSecret(`session:${token}`, this.config.authSecret);
  }

  private resetHash(token: string): string {
    return hashSecret(`reset:${token}`, this.config.authSecret);
  }

  private validateEmail(value: unknown): string {
    const email = normalizeEmail(value);
    if (!isValidEmail(email)) throw new ApiError(400, 'INVALID_EMAIL', 'Введите корректный email');
    return email;
  }

  async requestRegistration(input: RegistrationInput): Promise<{ retryAfter: number }> {
    const name = String(input.name || '').trim();
    const email = this.validateEmail(input.email);
    if (name.length < 2 || name.length > 80) throw new ApiError(400, 'INVALID_NAME', 'Введите имя');
    if (!isValidPassword(input.password)) throw new ApiError(400, 'INVALID_PASSWORD', 'Минимум 8 символов, буквы и цифры');
    const passwordHash = await hashPassword(String(input.password));
    return this.createChallenge({ email, purpose: 'register', pendingName: name, pendingPasswordHash: passwordHash });
  }

  async requestCode(input: CodeRequestInput): Promise<{ retryAfter: number }> {
    const email = this.validateEmail(input.email);
    return this.createChallenge({ email, purpose: input.purpose });
  }

  private async createChallenge(input: {
    email: string;
    purpose: AuthPurpose;
    pendingName?: string;
    pendingPasswordHash?: string;
  }): Promise<{ retryAfter: number }> {
    const now = this.now();
    const nowIso = new Date(now).toISOString();
    const fixedRegistrationCode = input.purpose === 'register' ? this.config.fixedRegistrationCode : undefined;
    const code = fixedRegistrationCode || createCode();
    const challengeId = randomUUID();
    const challenge = await this.store.mutate((database) => {
      this.cleanup(database, now);
      const user = database.users.find((item) => item.email === input.email);
      if (input.purpose === 'register' && user) throw new ApiError(409, 'EMAIL_EXISTS', 'Аккаунт с такой почтой уже существует');
      if (input.purpose !== 'register' && !user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт с такой почтой не найден');
      const recent = database.challenges
        .filter((item) => item.email === input.email && item.purpose === input.purpose)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      const latest = recent[0];
      if (latest) {
        const elapsedSeconds = Math.floor((now - new Date(latest.createdAt).getTime()) / 1000);
        if (elapsedSeconds < this.config.codeCooldownSeconds) {
          throw new ApiError(429, 'CODE_COOLDOWN', 'Код уже отправлен', this.config.codeCooldownSeconds - elapsedSeconds);
        }
      }
      const sentLastHour = recent.filter((item) => now - new Date(item.createdAt).getTime() < 60 * 60 * 1000).length;
      if (sentLastHour >= this.config.maxEmailsPerHour) {
        throw new ApiError(429, 'EMAIL_RATE_LIMIT', 'Слишком много писем. Попробуйте позже', 60 * 60);
      }
      const nextChallenge = {
        id: challengeId,
        email: input.email,
        purpose: input.purpose,
        codeHash: this.codeHash(input.email, input.purpose, code),
        expiresAt: new Date(now + this.config.codeLifetimeMinutes * 60 * 1000).toISOString(),
        createdAt: nowIso,
        attempts: 0,
        pendingName: input.pendingName,
        pendingPasswordHash: input.pendingPasswordHash,
      };
      database.challenges.push(nextChallenge);
      return nextChallenge;
    });

    if (!fixedRegistrationCode) {
      try {
        await this.mailer.sendCode({
          to: input.email,
          code,
          purpose: input.purpose,
          expiresMinutes: this.config.codeLifetimeMinutes,
          idempotencyKey: `auth-${challenge.id}`,
        });
      } catch (error) {
        await this.store.mutate((database) => {
          database.challenges = database.challenges.filter((item) => item.id !== challenge.id);
        });
        if (error instanceof EmailNotConfiguredError) {
          throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Отправка почты ещё не настроена');
        }
        throw new ApiError(502, 'EMAIL_SEND_FAILED', 'Почтовый сервис не принял письмо');
      }
    }
    return { retryAfter: this.config.codeCooldownSeconds };
  }

  async verifyCode(input: VerifyInput): Promise<VerifyResult> {
    const email = this.validateEmail(input.email);
    const code = String(input.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'INVALID_CODE', 'Введите шестизначный код');
    const now = this.now();
    const sessionToken = createToken();
    const resetToken = createToken();
    const result = await this.store.mutate((database) => {
      this.cleanup(database, now);
      const challenge = database.challenges
        .filter((item) => item.email === email && item.purpose === input.purpose && !item.usedAt)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
      if (!challenge || new Date(challenge.expiresAt).getTime() <= now) {
        return { error: new ApiError(400, 'CODE_EXPIRED', 'Код истёк. Запросите новый') };
      }
      if (challenge.attempts >= this.config.maxCodeAttempts) {
        return { error: new ApiError(429, 'CODE_LOCKED', 'Слишком много попыток. Запросите новый код') };
      }
      if (!secretsMatch(challenge.codeHash, this.codeHash(email, input.purpose, code))) {
        challenge.attempts += 1;
        return { error: new ApiError(400, 'INVALID_CODE', 'Неверный код') };
      }

      challenge.usedAt = new Date(now).toISOString();
      let user = database.users.find((item) => item.email === email);
      if (input.purpose === 'register') {
        if (user) return { error: new ApiError(409, 'EMAIL_EXISTS', 'Аккаунт уже существует') };
        if (!challenge.pendingName || !challenge.pendingPasswordHash) {
          return { error: new ApiError(400, 'REGISTRATION_EXPIRED', 'Начните регистрацию заново') };
        }
        user = {
          id: randomUUID(),
          name: challenge.pendingName,
          email,
          passwordHash: challenge.pendingPasswordHash,
          emailVerifiedAt: new Date(now).toISOString(),
          createdAt: new Date(now).toISOString(),
          balanceCoins: 0,
          gameEntitlements: [],
        };
        database.users.push(user);
      }
      if (!user) return { error: new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден') };

      if (input.purpose === 'recovery') {
        database.resetGrants.push({
          tokenHash: this.resetHash(resetToken),
          userId: user.id,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        });
        return { result: { purpose: input.purpose, resetToken } as VerifyResult };
      }

      database.sessions.push({
        tokenHash: this.sessionHash(sessionToken),
        userId: user.id,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + this.config.sessionDays * 24 * 60 * 60 * 1000).toISOString(),
      });
      return { result: { purpose: input.purpose, user: publicUser(user), sessionToken } as VerifyResult };
    });
    if ('error' in result && result.error) throw result.error;
    return result.result as VerifyResult;
  }

  async loginWithPassword(emailValue: unknown, passwordValue: unknown): Promise<{ user: PublicUser; sessionToken: string }> {
    const email = this.validateEmail(emailValue);
    const password = String(passwordValue || '');
    if (!password) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль');
    const user = await this.store.read((database) => database.users.find((item) => item.email === email));
    if (!user) {
      await hashPassword(password);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль');
    }
    const now = this.now();
    const sessionToken = createToken();
    await this.store.mutate((database) => {
      this.cleanup(database, now);
      database.sessions.push({
        tokenHash: this.sessionHash(sessionToken),
        userId: user.id,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + this.config.sessionDays * 24 * 60 * 60 * 1000).toISOString(),
      });
    });
    return { user: publicUser(user), sessionToken };
  }

  async getSession(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const now = this.now();
    return this.store.read((database) => {
      const session = database.sessions.find((item) => item.tokenHash === this.sessionHash(token) && new Date(item.expiresAt).getTime() > now);
      if (!session) return null;
      const user = database.users.find((item) => item.id === session.userId);
      return user ? publicUser(user) : null;
    });
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const tokenHash = this.sessionHash(token);
    await this.store.mutate((database) => {
      database.sessions = database.sessions.filter((item) => item.tokenHash !== tokenHash);
    });
  }

  async resetPassword(resetToken: string | undefined, passwordValue: unknown): Promise<void> {
    if (!resetToken) throw new ApiError(401, 'RESET_NOT_AUTHORIZED', 'Подтвердите код ещё раз');
    if (!isValidPassword(passwordValue)) throw new ApiError(400, 'INVALID_PASSWORD', 'Минимум 8 символов, буквы и цифры');
    const passwordHash = await hashPassword(String(passwordValue));
    const now = this.now();
    const tokenHash = this.resetHash(resetToken);
    const result = await this.store.mutate((database) => {
      this.cleanup(database, now);
      const grant = database.resetGrants.find((item) => item.tokenHash === tokenHash && !item.usedAt && new Date(item.expiresAt).getTime() > now);
      if (!grant) return false;
      const user = database.users.find((item) => item.id === grant.userId);
      if (!user) return false;
      user.passwordHash = passwordHash;
      grant.usedAt = new Date(now).toISOString();
      database.sessions = database.sessions.filter((item) => item.userId !== user.id);
      return true;
    });
    if (!result) throw new ApiError(401, 'RESET_NOT_AUTHORIZED', 'Ссылка восстановления истекла');
  }
}
