import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** Deletes the SQLite database files so the next seed starts clean. */
const base = process.env.DB_PATH || resolve(process.cwd(), 'server', 'data', 'booking.db');

for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(base + suffix, { force: true });
  } catch (err) {
    console.error(`Could not remove ${base + suffix}: ${err.message}`);
  }
}

console.log(`Removed database at ${base}`);
console.log('Run `npm run seed` to recreate it.');
