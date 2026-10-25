// Shared Vite dev server for the SSR rendering tests.
//
// Each test file that renders a component server-side needs a Vite server to
// load the JSX module. Ten test files each created their own server against
// the same `node_modules/.vite` optimizer cache. When the test runner ran
// those files in parallel, the servers raced on that shared cache: one
// server would read a partially written optimizer artifact, Vite would serve
// the truncated module, and the import-analysis step failed with "Failed to
// parse source for import analysis" on a file that is perfectly valid.
//
// The symptom looked like a code defect — "GENERATORS is not defined",
// syntax errors in files that parse fine — and it was intermittent, so it
// could easily be mistaken for a flaky test rather than a shared-cache race.
//
// The fix is to give every server its own cache directory. `createTestViteServer`
// does that, and all the rendering tests use it.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

let serverCounter = 0;

/**
 * Creates a Vite dev server for server-side rendering in tests.
 *
 * The cache directory is unique per server, so parallel test files cannot
 * corrupt one another's optimizer state. It lives in the OS temp directory
 * and is removed when the server closes.
 */
export async function createTestViteServer() {
  serverCounter += 1;
  const cacheDir = path.join(
    os.tmpdir(),
    'crushlearn-vite-test',
    `${process.pid}-${serverCounter}-${Date.now()}`
  );

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {
    // If the directory cannot be created, Vite will fall back to its default
    // location. The tests still run; they may be more exposed to the race.
  }

  const server = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
    cacheDir,
  });

  const close = server.close.bind(server);
  server.close = async () => {
    try {
      await close();
    } finally {
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      } catch {
        // A leftover temp directory is harmless.
      }
    }
  };

  return server;
}
