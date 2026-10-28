import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getEditionLaunch, identifyEdition, inspectRunningEdition } from '../scripts/start-edition.mjs';

const original = `export const STAMPS = [${['joy', 'anger', 'sorrow', 'delight', 'motion', 'stillness', 'surprise', 'doubt'].map(id => `{image:'/assets/lion-states/lion-${id}.png'}`).join(',')}];`;
const regional = `export const STAMPS = [${['01-foshan', '02-guangzhou', '03-heshan', '04-suixi', '05-beijing', '06-tianyang', '07-quanzhou', '08-hongkong', '09-singapore', '10-kualalumpur', '11-sanfrancisco', '12-london'].map(id => `{image:'/assets/stamps/${id}.png'}`).join(',')}];`;
const presets = `export const LIGHT_PRESETS = [${['legacy-multiply', 'local-add', 'screen', 'soft-light', 'diffuse-transmission', 'luminance'].map(id => `{id:'${id}'}`).join(',')}];`;

test('launcher fixes independent ports and resolves Unicode or spaced project paths', () => {
  const original = getEditionLaunch('original', 'C:/Projects/Postal Studies');
  const regional = getEditionLaunch('regional', 'C:/Projects/Postal Studies');
  assert.equal(original.port, 4173); assert.equal(regional.port, 4174);
  assert.notEqual(original.cwd, regional.cwd);
  assert.ok(regional.cwd.endsWith('editions\\regional') || regional.cwd.endsWith('editions/regional'));
  assert.equal(original.vite, regional.vite);
  assert.equal(getEditionLaunch('regional', 'C:/Projects/醒狮邮票').url, 'http://127.0.0.1:4174/');
  assert.throws(() => getEditionLaunch('other'), /original\|regional/);
});

test('identity rejects HTML fallback, incomplete stamps and a regional build without all six algorithms', () => {
  assert.equal(identifyEdition(original), 'original');
  assert.equal(identifyEdition(regional, presets), 'regional');
  assert.equal(identifyEdition('<html>STAMPS</html>', presets), null);
  assert.equal(identifyEdition(original.replace('lion-doubt.png', 'lion-other.png')), null);
  assert.equal(identifyEdition(regional, '<html>Missing module</html>'), null);
  assert.equal(identifyEdition(regional, presets.replace('luminance', 'unknown')), null);
});

test('running service inspection recognizes each edition without starting or stopping it', async t => {
  let edition = 'original';
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(request.url === '/src/config.js' ? (edition === 'original' ? original : regional) : (edition === 'original' ? '<html>fallback</html>' : presets));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port, target = { host: '127.0.0.1', port, url: `http://127.0.0.1:${port}/` };
  assert.deepEqual(await inspectRunningEdition(target), { occupied: true, edition: 'original' });
  edition = 'regional';
  assert.deepEqual(await inspectRunningEdition(target), { occupied: true, edition: 'regional' });
  assert.ok(server.listening, 'the inspector must not terminate a server');
});

test('a foreign HTTP service is reported occupied rather than treated as an available port', async t => {
  const server = http.createServer((_request, response) => { response.end('<html>Another application</html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  assert.deepEqual(await inspectRunningEdition({ host: '127.0.0.1', port, url: `http://127.0.0.1:${port}/` }), { occupied: true, edition: null });
  assert.ok(server.listening);
});
