/**
 * Test entry point.
 *
 * It does three things and then gets out of the way: point the database at a
 * throwaway directory, build the fixture there, and import the assertions.
 *
 * The import of the suite is dynamic for a reason. A static import would be
 * hoisted above the two lines below it, the database module would read
 * DATABASE_DIR before it was set, and the whole suite would run against — and
 * write to — the demo database. That happened once; hence this file.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

process.env.DATABASE_DIR = process.env.TEST_DATABASE_DIR ?? '.data/test';
process.env.DEMO_MODE = '1';
// A key here would make the stylist tests depend on a network call and on
// somebody else's model behaving; the offline recommender is what is tested.
process.env.AI_PROVIDER = 'rules';
process.env.AI_API_KEY = '';

rmSync(process.env.DATABASE_DIR, { recursive: true, force: true });

const run = (script: string) =>
  execFileSync(process.execPath, [
    new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    '--tsconfig',
    'tsconfig.scripts.json',
    script,
  ], {
    stdio: 'inherit',
    env: { ...process.env },
  });

run('scripts/db-migrate.ts');
run('scripts/seed.ts');

await import('./suite');
