import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuthDatabase } from './types.js';

const EMPTY_DATABASE: AuthDatabase = {
  users: [],
  challenges: [],
  sessions: [],
  resetGrants: [],
  promoCodes: [],
  promoRedemptions: [],
  payments: [],
};

function normalizeDatabase(value: Partial<AuthDatabase> | null): AuthDatabase {
  return {
    users: Array.isArray(value?.users) ? value.users : [],
    challenges: Array.isArray(value?.challenges) ? value.challenges : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
    resetGrants: Array.isArray(value?.resetGrants) ? value.resetGrants : [],
    promoCodes: Array.isArray(value?.promoCodes) ? value.promoCodes : [],
    promoRedemptions: Array.isArray(value?.promoRedemptions) ? value.promoRedemptions : [],
    payments: Array.isArray(value?.payments) ? value.payments : [],
  };
}

export class JsonAuthStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async readUnlocked(): Promise<AuthDatabase> {
    try {
      return normalizeDatabase(JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AuthDatabase>);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return structuredClone(EMPTY_DATABASE);
    }
  }

  private async writeUnlocked(database: AuthDatabase): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async read<T>(reader: (database: AuthDatabase) => T | Promise<T>): Promise<T> {
    await this.queue;
    return reader(await this.readUnlocked());
  }

  async mutate<T>(mutator: (database: AuthDatabase) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const database = await this.readUnlocked();
      const result = await mutator(database);
      await this.writeUnlocked(database);
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
