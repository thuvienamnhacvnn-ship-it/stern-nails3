import 'server-only';

import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
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
  return process.env.DATABASE_DIR ?? '.data/pg';
}

function open(): PgliteDatabase<typeof schema> {
  if (!globalThis.__sternDb) {
    // Assigned before anything can await, so two callers cannot both construct.
    globalThis.__sternPglite ??= new PGlite(dataDir());
    globalThis.__sternDb = drizzle(globalThis.__sternPglite, { schema, casing: 'snake_case' });
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
