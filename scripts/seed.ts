/**
 * Fills the local database with the demo data.
 *
 * The data itself is in `src/db/seed.ts`, because the site has to be able to
 * build a database from nothing when it runs somewhere without a disk of its
 * own. This is the command a developer runs against `.data/pg`.
 *
 * PGlite lets exactly one process hold the data directory, so stop
 * `npm run dev` first.
 */
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { refuseIfDevServerRunning } from './guard-single-process';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema';
import { seed } from '../src/db/seed';

await refuseIfDevServerRunning();

const dir = process.env.DATABASE_DIR ?? '.data/pg';
mkdirSync(dir, { recursive: true });

const client = new PGlite(dir);
await seed(drizzle(client, { schema, casing: 'snake_case' }));
await client.close();

console.log(`seeded ${dir}`);
console.log(`  admin sign-in: admin@stern-nails.demo / ${process.env.ADMIN_SEED_PASSWORD ?? 'stern-demo-2026'}`);
console.log('  address, phone and legal details left null on purpose — the studio fills those in.');
