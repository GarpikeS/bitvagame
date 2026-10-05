import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { PromoService } from '../src/promo-service.js';
import { JsonAuthStore } from '../src/store.js';

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function printHelp(): never {
  console.error([
    'Создание: npm run promo:create -- CODE REWARD --max-uses=30 --per-user-limit=1 --expires-at=2026-12-31T23:59:59Z',
    'Статистика: npm run promo:stats',
  ].join('\n'));
  process.exit(1);
}

const command = process.argv[2];
const config = loadConfig();
const promos = new PromoService(new JsonAuthStore(config.dataFile));

try {
  if (command === 'create') {
    const code = process.argv[3];
    const rewardCoins = process.argv[4];
    if (!code || !rewardCoins) printHelp();
    const created = await promos.create({
      code,
      rewardCoins,
      maxUses: option('max-uses'),
      perUserLimit: option('per-user-limit'),
      expiresAt: option('expires-at'),
    });
    console.log(JSON.stringify(created, null, 2));
  } else if (command === 'stats') {
    console.log(JSON.stringify(await promos.listStats(), null, 2));
  } else {
    printHelp();
  }
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`${error.code}: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
