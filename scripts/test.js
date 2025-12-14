/* Simple smoke tests for the vault server using a temporary vault. */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const request = require('supertest');

async function run() {
  const vaultRoot = path.join(__dirname, '..', 'tmp-test-vault');
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  fs.mkdirSync(vaultRoot, { recursive: true });
  fs.writeFileSync(path.join(vaultRoot, 'sample.md'), '# Sample\n\nContent here.');
  fs.mkdirSync(path.join(vaultRoot, 'Daily'), { recursive: true });
  fs.writeFileSync(path.join(vaultRoot, 'Daily', 'note.md'), '# Daily Note');
  fs.writeFileSync(path.join(vaultRoot, 'image-221.webp'), 'binary');

  const settingsPath = path.join(vaultRoot, '.settings.test.json');

  process.env.VAULT_ROOT = vaultRoot;
  process.env.AUTH_USER = 'tester';
  process.env.AUTH_PASS = 'secret';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.SETTINGS_PATH = settingsPath;

  const { buildApp } = require('../server');
  const app = buildApp();
  const agent = request.agent(app);

  // Health should be open.
  const health = await agent.get('/api/health').expect(200);
  assert(health.body.ok === true, 'health ok');

  await agent.post('/api/login').send({ username: 'tester', password: 'secret' }).expect(200);

  const settingsDefault = await agent.get('/api/settings').expect(200);
  assert(settingsDefault.body.settings.dailyNotesDir === 'Daily', 'default daily dir');
  assert(settingsDefault.body.settings.fileSortOrder === 'mtime_desc', 'default sort');

  await agent
    .post('/api/settings')
    .send({ dailyNotesDir: 'DailyTests', dailyNotesTemplate: 'DailyTests/YYYY-MM-DD DAILY.md', fileSortOrder: 'name_asc' })
    .expect(200);

  const listRes = await agent.get('/api/list').expect(200);
  assert(Array.isArray(listRes.body.items), 'list items array');

  let currentPath = 'sample.md';

  const fileRes = await agent.get('/api/file').query({ path: currentPath }).expect(200);
  assert(fileRes.body.content.includes('Sample'), 'file content');

  await agent.post('/api/file/save').send({ path: currentPath, content: '# Updated\n\nNew text' }).expect(200);

  await agent.post('/api/file/rename').send({ oldPath: currentPath, newPath: 'renamed.md' }).expect(200);
  currentPath = 'renamed.md';
  const renamedRes = await agent.get('/api/file').query({ path: currentPath }).expect(200);
  assert(renamedRes.body.content.includes('Updated'), 'rename preserved content');

  const searchRes = await agent.get('/api/search').query({ q: 'Updated' }).expect(200);
  assert(searchRes.body.results.length >= 1, 'search finds text');

  const dayRes = await agent.post('/api/day').send({ date: '2025-01-01' }).expect(200);
  assert(dayRes.body.path.startsWith('DailyTests/2025-01-01'), 'daily note respects template path');

  fs.writeFileSync(path.join(vaultRoot, 'c.md'), '# C');
  fs.writeFileSync(path.join(vaultRoot, 'a.md'), '# A');
  const listRes2 = await agent.get('/api/list').expect(200);
  const fileNames = listRes2.body.items.filter((i) => i.type === 'file').map((i) => i.name);
  const expected = [...fileNames].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(fileNames, expected, 'name_asc ordering applied to files');

  const resolveRes = await agent.get('/api/resolve-wiki').query({ target: 'note' }).expect(200);
  assert(resolveRes.body.path === 'Daily/note.md', 'resolve wiki finds file in subfolder');
  const resolveImage = await agent.get('/api/resolve-wiki').query({ target: 'image-221.webp' }).expect(200);
  assert(resolveImage.body.path.endsWith('image-221.webp'), 'resolve wiki finds image');

  fs.rmSync(vaultRoot, { recursive: true, force: true });

  console.log('All smoke tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
