/**
 * Local development: rebuilds the client on change and restarts the API server on change.
 *   npm run dev   → http://localhost:4173
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const node = process.execPath;

const builder = spawn(node, ['scripts/build.mjs', '--watch'], { cwd: root, stdio: 'inherit' });

let server = null;
function startServer() {
  server = spawn(node, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], { cwd: root, stdio: 'inherit' });
}
let timer = null;
function restart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('[dev] server change detected — restarting');
    if (server) {
      server.once('exit', startServer);
      server.kill('SIGTERM');
    } else startServer();
  }, 150);
}
startServer();
for (const dir of ['server', 'config']) watch(path.join(root, dir), { recursive: true }, restart);

const stop = () => {
  builder.kill('SIGTERM');
  server?.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
