/**
 * Applies the generated SQL migrations to the local PGlite database.
 *
 * PGlite lets exactly one process hold the data directory, so stop
 * `npm run dev` first or this fails to open the database.
 */
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { refuseIfDevServerRunning } from './guard-single-process';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

await refuseIfDevServerRunning();

const dir = process.env.DATABASE_DIR ?? '.data/pg';

// PGlite creates its own directory but not the one above it, so on a fresh
// checkout the first migration otherwise dies with an ENOENT wrapped in a
// Drizzle query error — which reads like a broken migration, not a missing
// folder.
mkdirSync(dir, { recursive: true });

const client = new PGlite(dir);
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.close();

console.log(`migrations applied to ${dir}`);
