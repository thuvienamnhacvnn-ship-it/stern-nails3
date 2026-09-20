import 'server-only';

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

/**
 * The database handle.
 *
 * PGlite is Postgres compiled to WebAssembly, running inside this process
 * against a directory on disk. It is here because a native Postgres cannot be
 * installed on this workstation — every Postgres binary is blocked before it
 * runs — and it speaks the same SQL, so moving to a server later is a
 * connection string, not a rewrite.
 *
 * PGlite allows exactly one open handle per data directory, and a second one
 * does not fail politely: the WebAssembly module aborts and the abort surfaces
 * somewhere else entirely as an unhandled rejection. So the instance is created
 * lazily on first use and parked on `globalThis`, because module evaluation
 * happens more than once under the bundler and on every hot reload.
 *
 * The same rule holds outside the server: stop `npm run dev` before running the
 * migration, the seed or the tests.
 */
declare global {
  // eslint-disable-next-line no-var
  var __sternPglite: PGlite | undefined;
  // eslint-disable-next-line no-var
  var __sternDb: PgliteDatabase<typeof schema> | undefined;
  // eslint-disable-next-line no-var
  var __sternReady: Promise<void> | undefined;
}

/**
 * Where the data lives, resolved on first use rather than at import.
 *
 * This is a function, not a constant, on purpose. ES modules hoist every import
 * above the first statement of the importing file, so a script that sets
 * `process.env.DATABASE_DIR` at the top of itself sets it *after* this module
 * has already been evaluated. Reading the variable at module scope therefore
 * silently pinned the test suite to the demo database — which it then wrote to.
 */
export function dataDir(): string {
  if (process.env.DATABASE_DIR) return process.env.DATABASE_DIR;
  /*
   * On a serverless host the application directory is read only. PGlite's first
   * act is to create its data directory, so with the default below the very
   * first query died on `mkdir` and every page answered 500 — a deployment that
   * built cleanly and then showed nothing at all.
   *
   * `/tmp` is the one writable place there, and it is per instance: see the
   * bootstrap below for what that costs.
   */
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return '/tmp/stern-nails-pg';
  return '.data/pg';
}

/**
 * Brings an empty directory up to a working database: the schema, then the demo
 * rows if there are none.
 *
 * A checkout has a database because somebody ran `db:migrate` and `db:seed`
 * against it. A serverless instance has an empty `/tmp` and no chance to run a
 * command, and `.data/` is not in the repository, so without this there is
 * nothing to read and nothing that could have put anything there.
 *
 * What it costs is worth saying plainly: each instance builds its own copy, so
 * an appointment or a gift card created on one is not visible on another and is
 * gone when that instance is recycled. That is a demo, not a booking system. A
 * real deployment points `DATABASE_URL` at a Postgres server — the schema is
 * unchanged, PGlite is a directory rather than a dialect.
 */
async function bootstrap(client: PGlite, dir: string, loadedFromBake: boolean): Promise<void> {
  await client.waitReady;
  // A baked database arrives migrated and seeded; there is nothing left to do.
  if (loadedFromBake) return;

  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  const [row] = await db.select({ id: schema.businessSettings.id }).from(schema.businessSettings).limit(1);
  if (!row) {
    const { seed } = await import('./seed');
    await seed(db);
    console.log(`[db] built a fresh database in ${dir}`);
  }
}

function open(): PgliteDatabase<typeof schema> {
  if (!globalThis.__sternDb) {
    const dir = dataDir();
    // PGlite makes its own directory but not the one above it.
    mkdirSync(dir, { recursive: true });

    /*
     * An empty directory is filled from the database baked at build time, if
     * there is one. Building it here instead takes eleven seconds, which is
     * longer than a serverless function is allowed to live.
     */
    const baked = join(process.cwd(), 'drizzle', 'seed-db.tgz');
    const useBake = !existsSync(join(dir, 'PG_VERSION')) && existsSync(baked);

    // Assigned before anything can await, so two callers cannot both construct.
    const client = (globalThis.__sternPglite ??= useBake
      ? new PGlite({ dataDir: dir, loadDataDir: new Blob([readFileSync(baked)]) })
      : new PGlite(dir));
    const ready = (globalThis.__sternReady ??= bootstrap(client, dir, useBake));

    /*
     * Every query waits for the bootstrap, and nothing above has to know.
     *
     * The gate is on the PGlite handle rather than on the Drizzle instance
     * because Drizzle's builders are chained and only run when awaited — there
     * is no single call to wrap. Underneath, all of them arrive here.
     */
    const gated = new Proxy(client, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        if (property === 'query' || property === 'exec' || property === 'transaction') {
          return async (...args: unknown[]) => {
            await ready;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });

    globalThis.__sternDb = drizzle(gated, { schema, casing: 'snake_case' });
  }
  return globalThis.__sternDb;
}

/**
 * Behaves like the drizzle instance but defers opening the database until a
 * query is issued, so importing this module is free and a page that never
 * touches the database never opens it.
 */
export const db = new Proxy({} as PgliteDatabase<typeof schema>, {
  get(_target, property, receiver) {
    const instance = open() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(instance, property, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export { schema };
