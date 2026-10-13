/**
 * npm run seed            — seed demo catalog if the database is empty
 * npm run seed -- --reset — DELETE the database file and reseed (development only)
 */
import { existsSync, rmSync } from 'node:fs';
import { env } from '../env.ts';
import { openDb, closeDb } from '../db/index.ts';
import { seedIfEmpty } from './seed-data.ts';

if (process.argv.includes('--reset')) {
  if (env.isProd) {
    console.error('Refusing to reset the database with NODE_ENV=production.');
    process.exit(1);
  }
  for (const f of [env.databasePath, env.databasePath + '-wal', env.databasePath + '-shm']) if (existsSync(f)) rmSync(f);
  console.log('Database removed.');
}
openDb(env.databasePath);
const seeded = await seedIfEmpty();
console.log(seeded ? 'Demo catalog seeded.' : 'Database already has products — nothing seeded.');
closeDb();
