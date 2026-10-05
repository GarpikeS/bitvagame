import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { SmtpConfig } from './config.js';
import type { AuthPurpose } from './types.js';

export interface SendCodeMessage {
  to: string;
  code: string;
  purpose: AuthPurpose;
  expiresMinutes: number;
  idempotencyKey: string;
}

export interface AuthMailer {
  isConfigured: boolean;
  sendCode(message: SendCodeMessage): Promise<void>;
}

export class EmailNotConfiguredError extends Error {}

function purposeTitle(purpose: AuthPurpose): string {
  if (purpose === 'register') return 'Подтверждение регистрации';
  if (purpose === 'login') return 'Код для входа';
  return 'Восстановление пароля';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function codeMessage(message: SendCodeMessage): Pick<SendMailOptions, 'subject' | 'text' | 'html'> {
  const title = purposeTitle(message.purpose);
  const code = escapeHtml(message.code);
  return {
    subject: `${title} — Битва игр`,
    text: `${title}. Ваш код: ${message.code}. Код действует ${message.expiresMinutes} минут. Если это были не вы, проигнорируйте письмо.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#151515"><h1 style="color:#ff4b2b">${title}</h1><p>Ваш одноразовый код:</p><p style="font-size:36px;font-weight:800;letter-spacing:8px">${code}</p><p>Код действует ${message.expiresMinutes} минут.</p><p style="color:#777">Если это были не вы, просто проигнорируйте письмо.</p></div>`,
  };
}

interface MailTransport {
  sendMail(message: SendMailOptions): Promise<unknown>;
}

export class SmtpMailer implements AuthMailer {
  readonly isConfigured: boolean;
  private readonly transport: MailTransport | null;

  constructor(
    private readonly config: SmtpConfig | undefined,
    private readonly from: string,
    transport?: MailTransport,
  ) {
    this.isConfigured = Boolean(config?.host && config.port && config.user && config.password && from);
    this.transport = transport || (this.isConfigured && config ? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    }) : null);
  }

  async sendCode(message: SendCodeMessage): Promise<void> {
    if (!this.isConfigured || !this.transport) {
      throw new EmailNotConfiguredError('SMTP email delivery is not configured');
    }
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      ...codeMessage(message),
      headers: { 'X-Auth-Challenge-Id': message.idempotencyKey },
    });
  }
}

export class ResendMailer implements AuthMailer {
  readonly isConfigured: boolean;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {
    this.isConfigured = Boolean(apiKey && from);
  }

  async sendCode(message: SendCodeMessage): Promise<void> {
    if (!this.isConfigured) throw new EmailNotConfiguredError('Email delivery is not configured');
    const content = codeMessage(message);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        ...content,
        tags: [{ name: 'category', value: `auth_${message.purpose}` }],
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Resend rejected email (${response.status}): ${details.slice(0, 500)}`);
    }
  }
}
