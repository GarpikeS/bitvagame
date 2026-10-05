import { loadEnvFile } from 'node:process';
import { buildApp } from './src/app.js';
import { loadConfig } from './src/config.js';

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const config = loadConfig();
const app = await buildApp({
  config,
  // Nginx serves the production frontend. Keep the API process focused on /api
  // so an unknown API route can never fall through to the SPA index.html.
  serveStatic: process.env.SERVE_STATIC === 'true',
});

await app.listen({ port: config.port, host: config.host });
if (!config.production) {
  console.log(`Auth API: http://${config.host}:${config.port}`);
  if (!config.resendApiKey || !config.emailFrom) {
    console.warn('Email is disabled: set RESEND_API_KEY and EMAIL_FROM in .env');
  }
}
