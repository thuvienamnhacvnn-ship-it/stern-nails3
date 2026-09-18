import { createConnection } from 'node:net';

/**
 * Refuses to run while the dev server is up.
 *
 * PGlite allows exactly one process to hold a data directory. A second one does
 * not error politely — the WebAssembly module aborts, and the damage shows up
 * later as an empty catalogue or a half-written table, which reads like a bug in
 * the application rather than two processes fighting over a file.
 *
 * So the migration and the seed check the dev port first and stop with an
 * instruction instead. It costs a millisecond and saves an afternoon.
 */
export async function refuseIfDevServerRunning(port = 3110): Promise<void> {
  const inUse = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const done = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(400);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

  if (!inUse) return;

  console.error(
    [
      '',
      `Something is already listening on port ${port} — almost certainly \`npm run dev\`.`,
      '',
      'PGlite lets one process hold the database at a time. Running this now would',
      'corrupt it rather than fail cleanly. Stop the dev server and try again.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
