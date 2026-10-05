import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { SmtpMailer } from '../src/mailer.js';

function decodeHeader(mime: string, name: string): string {
  const value = mime.match(new RegExp(`^${name}: (.*(?:\\r?\\n[ \\t].*)*)`, 'mi'))?.[1] || '';
  // RFC 2047 ignores folding whitespace between adjacent encoded words.
  return value.replace(/(\?=)[ \t\r\n]+(?==\?UTF-8\?)/gi, '$1')
    .replace(/\r?\n[ \t]+/g, ' ').replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_word, encoding: string, encoded: string) => {
      if (encoding.toUpperCase() === 'B') return Buffer.from(encoded, 'base64').toString('utf8');
      const bytes = encoded.replaceAll('_', ' ').replace(/=([\da-f]{2})/gi, (_hex, code: string) => String.fromCharCode(parseInt(code, 16)));
      return Buffer.from(bytes, 'latin1').toString('utf8');
    });
}

test('real Nodemailer transport preserves Cyrillic login headers and the intended recipient', async () => {
  // Stream transport exercises the installed MIME implementation without SMTP credentials or network.
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  let mime = '';
  const mailer = new SmtpMailer({ host: 'smtp.example.test', port: 465, secure: true,
    user: 'fixture-user', password: 'fixture-password' }, '"Битва игр" <support@example.test>', {
    async sendMail(message) {
      const result = await transport.sendMail(message);
      assert.deepEqual(result.envelope.to, ['recipient@example.test']);
      assert.equal(result.envelope.from, 'support@example.test');
      mime = result.message.toString('utf8');
      return result;
    },
  });
  await mailer.sendCode({ to: 'recipient@example.test', code: '482915', purpose: 'login',
    expiresMinutes: 10, idempotencyKey: 'mime-fixture' });
  assert.match(decodeHeader(mime, 'From'), /Битва игр/);
  assert.match(decodeHeader(mime, 'From'), /support@example\.test/);
  assert.equal(decodeHeader(mime, 'Subject'), 'Код для входа — Битва игр');
  assert.match(mime, /^X-Auth-Challenge-Id: mime-fixture\r?$/mi);
  assert.match(mime, /482915/);
});
