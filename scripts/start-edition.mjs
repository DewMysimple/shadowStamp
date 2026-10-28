import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGINAL_IMAGES = ['joy', 'anger', 'sorrow', 'delight', 'motion', 'stillness', 'surprise', 'doubt']
  .map(id => `/assets/lion-states/lion-${id}.png`);
const REGIONAL_IMAGES = ['01-foshan', '02-guangzhou', '03-heshan', '04-suixi', '05-beijing', '06-tianyang',
  '07-quanzhou', '08-hongkong', '09-singapore', '10-kualalumpur', '11-sanfrancisco', '12-london']
  .map(id => `/assets/stamps/${id}.png`);
const ALGORITHMS = ['legacy-multiply', 'local-add', 'screen', 'soft-light', 'diffuse-transmission', 'luminance'];
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/** Identify real source responses; Vite's HTML fallback must not count as a module. */
export function identifyEdition(configSource, presetSource = '') {
  if (!/export\s+const\s+STAMPS\b/.test(configSource)) return null;
  const images = [...configSource.matchAll(/\bimage\s*:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  const exact = expected => images.length === expected.length && images.every((image, index) => image === expected[index]);
  if (exact(ORIGINAL_IMAGES)) return 'original';
  const algorithms = [...presetSource.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  if (exact(REGIONAL_IMAGES) && /export\s+const\s+LIGHT_PRESETS\b/.test(presetSource)
    && algorithms.length === ALGORITHMS.length && algorithms.every((id, index) => id === ALGORITHMS[index])) return 'regional';
  return null;
}

export function getEditionLaunch(edition, root = projectRoot) {
  if (!['original', 'regional'].includes(edition)) throw new Error('Usage: node scripts/start-edition.mjs original|regional');
  const port = edition === 'original' ? 4173 : 4174;
  const cwd = edition === 'original' ? resolve(root) : resolve(root, 'editions', 'regional');
  return { edition, port, host: '127.0.0.1', cwd, url: `http://127.0.0.1:${port}/`,
    vite: join(root, 'node_modules', 'vite', 'bin', 'vite.js') };
}

function isPortOccupied(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const finish = (error, occupied) => { socket.destroy(); error ? reject(error) : resolve(occupied); };
    socket.setTimeout(1500, () => finish(new Error(`Cannot inspect ${host}:${port}: connection timed out.`)));
    socket.once('connect', () => finish(null, true));
    socket.once('error', error => error.code === 'ECONNREFUSED' ? finish(null, false) : finish(error));
  });
}

/** Never take over or terminate a process that already owns the selected port. */
export async function inspectRunningEdition({ host, port, url }) {
  if (!await isPortOccupied(host, port)) return { occupied: false, edition: null };
  try {
    const read = async path => {
      const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      return response.ok ? response.text() : '';
    };
    const [config, presets] = await Promise.all([read('/src/config.js'), read('/src/lightPresets.js')]);
    return { occupied: true, edition: identifyEdition(config, presets) };
  } catch { return { occupied: true, edition: null }; }
}

function openBrowser(url) {
  if (process.env.POSTAL_NO_OPEN === '1') return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', error => console.error(`Open ${url} manually: ${error.message}`));
  child.unref();
}

export async function startEdition(edition) {
  const launch = getEditionLaunch(edition);
  const running = await inspectRunningEdition(launch);
  if (running.occupied) {
    if (running.edition !== edition) throw new Error(`Port ${launch.port} is occupied by ${running.edition ?? 'an unknown service'}. No process was stopped. Free this port before starting the ${edition} edition.`);
    console.log(`[Postal Studies] Reusing ${edition} edition: ${launch.url}`);
    openBrowser(launch.url);
    return 0;
  }
  try { await Promise.all([access(launch.vite), access(join(launch.cwd, 'index.html')), access(join(launch.cwd, 'vite.config.js'))]); }
  catch { throw new Error('The edition or shared dependencies are missing. Run npm install in the project root, then retry.'); }
  const args = [launch.vite, '--host', launch.host, '--port', String(launch.port), '--strictPort'];
  if (process.env.POSTAL_NO_OPEN !== '1') args.push('--open');
  console.log(`[Postal Studies] Starting ${edition} edition: ${launch.url}`);
  const child = spawn(process.execPath, args, { cwd: launch.cwd, stdio: 'inherit', windowsHide: true });
  const stop = signal => child.kill(signal);
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  return new Promise((resolve, reject) => {
    const cleanup = () => { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); resolve(code ?? (signal ? 1 : 0)); });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await startEdition(process.argv[2]); }
  catch (error) { console.error(`[Postal Studies] ${error.message}`); process.exitCode = 1; }
}
