import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function isValidPassword(value: unknown): value is string {
  const password = String(value || '');
  return password.length >= 8 && password.length <= 128 && /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = (await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createCode(): string {
  return String(randomInt(100000, 1000000));
}

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function secretsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
