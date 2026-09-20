/**
 * Bakes the demo database into the build.
 *
 * A serverless host gives the application a read-only directory and an empty
 * `/tmp`, and no opportunity to run `db:migrate` and `db:seed`. The site can
 * build its own database on the first request instead — and did, until it was
 * timed: eleven seconds, against a ten second function limit. A deployment that
 * builds cleanly and then times out on every cold request is a deployment that
 * shows nothing.
 *
 * So the work moves to build time. The result is dumped as a gzipped tarball —
 * forty megabytes of mostly empty Postgres pages compress to a couple — and the
 * running site hands that file to PGlite instead of starting from nothing.
 *
 * It writes into `drizzle/`, which already travels with the deployment because
 * the migrations are there.
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';
import { seed } from '../src/db/seed';

const out = join('drizzle', 'seed-db.tgz');
const work = join(tmpdir(), `stern-build-db-${process.pid}`);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const client = new PGlite(work);
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await seed(drizzle(client, { schema, casing: 'snake_case' }));

const dump = await client.dumpDataDir('gzip');
await client.close();

writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
rmSync(work, { recursive: true, force: true });

console.log(`baked ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
