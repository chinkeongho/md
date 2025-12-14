// Minimal Obsidian-style server for browsing and editing Markdown in `zett/`.
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');

const DEFAULT_VAULT = path.join(__dirname, 'zett');
const DEFAULT_PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'password';
const SETTINGS_PATH = path.resolve(process.env.SETTINGS_PATH || path.join(__dirname, '.vault_settings.json'));
const VAULT_ROOT = path.resolve(process.env.VAULT_ROOT || DEFAULT_VAULT);
const MAX_SEARCH_RESULTS = 50;

const DEFAULT_SETTINGS = {
  dailyNotesDir: 'Daily',
  dailyNotesTemplate: 'Daily/YYYY-MM-DD DAILY.md',
  weeklyNotesDir: 'Weekly notes',
  weeklyNotesTemplate: 'Weekly notes/YYYY-{W}WW.md',
  weekStartsOn: 'monday',
  noteTemplate: `---
created: {{created}}
updated: {{updated}}
exercise:
mood:
code:
---

`,
  fileSortOrder: 'mtime_desc',
  shortcutBack: 'Alt+ArrowLeft',
  shortcutForward: 'Alt+ArrowRight',
shortcutSave: 'Ctrl+S',
shortcutLineUp: 'Alt+ArrowUp',
shortcutLineDown: 'Alt+ArrowDown',
shortcutMultiSelect: 'Ctrl+D',
shortcutMultiSelectAll: 'Ctrl+Shift+D',
shortcutToggleSidebar: 'Alt+S',
theme: 'light',
searchLimit: 1000
};

const ALLOWED_SORT_ORDERS = ['mtime_desc', 'mtime_asc', 'name_asc', 'name_desc'];
const ALLOWED_THEMES = [
  'light',
  'midnight',
  'dracula',
  'monokai',
  'solarized',
  'tokyonight',
  'nord',
  'gruvbox',
  'catppuccin',
  'catppuccin-latte',
  'ocean',
  'forest',
  'sand',
  'paper'
];
const PROJECT_README = path.join(__dirname, 'README.md');

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function resolveVaultPath(relPath = '') {
  const safeRel = relPath ? relPath.replace(/^\/+/, '') : '';
  const fullPath = path.resolve(VAULT_ROOT, safeRel || '.');
  if (!fullPath.startsWith(VAULT_ROOT)) {
    throw new Error('Invalid path');
  }
  return fullPath;
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function sanitizeSettings(partial = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...partial };
  const cleaned = { ...merged };
  if (typeof merged.dailyNotesDir === 'string') {
    const trimmed = merged.dailyNotesDir.trim().replace(/^\/+|\/+$/g, '');
    if (trimmed.includes('..')) {
      throw new Error('Invalid dailyNotesDir');
    }
    cleaned.dailyNotesDir = trimmed;
  } else {
    cleaned.dailyNotesDir = DEFAULT_SETTINGS.dailyNotesDir;
  }
  if (typeof merged.dailyNotesTemplate === 'string') {
    const t = merged.dailyNotesTemplate.trim().replace(/^\/+/, '');
    if (t.includes('..')) {
      throw new Error('Invalid dailyNotesTemplate');
    }
    cleaned.dailyNotesTemplate = t.includes('YYYY-MM-DD') ? t : `${t}/YYYY-MM-DD.md`;
  } else {
    cleaned.dailyNotesTemplate = DEFAULT_SETTINGS.dailyNotesTemplate;
  }
  if (typeof merged.weeklyNotesDir === 'string') {
    const trimmed = merged.weeklyNotesDir.trim().replace(/^\/+|\/+$/g, '');
    if (trimmed.includes('..')) {
      throw new Error('Invalid weeklyNotesDir');
    }
    cleaned.weeklyNotesDir = trimmed;
  } else {
    cleaned.weeklyNotesDir = DEFAULT_SETTINGS.weeklyNotesDir;
  }
  if (typeof merged.weeklyNotesTemplate === 'string') {
    const t = merged.weeklyNotesTemplate.trim().replace(/^\/+/, '');
    if (t.includes('..')) {
      throw new Error('Invalid weeklyNotesTemplate');
    }
    cleaned.weeklyNotesTemplate = t.includes('WW') ? t : `${t}/YYYY-{W}WW.md`;
  } else {
    cleaned.weeklyNotesTemplate = DEFAULT_SETTINGS.weeklyNotesTemplate;
  }
  if (!ALLOWED_SORT_ORDERS.includes(merged.fileSortOrder)) {
    cleaned.fileSortOrder = DEFAULT_SETTINGS.fileSortOrder;
  }
  cleaned.shortcutBack = typeof merged.shortcutBack === 'string' ? merged.shortcutBack : DEFAULT_SETTINGS.shortcutBack;
  cleaned.shortcutForward = typeof merged.shortcutForward === 'string' ? merged.shortcutForward : DEFAULT_SETTINGS.shortcutForward;
  cleaned.shortcutSave = typeof merged.shortcutSave === 'string' ? merged.shortcutSave : DEFAULT_SETTINGS.shortcutSave;
  cleaned.shortcutLineUp = typeof merged.shortcutLineUp === 'string' ? merged.shortcutLineUp : DEFAULT_SETTINGS.shortcutLineUp;
  cleaned.shortcutLineDown = typeof merged.shortcutLineDown === 'string' ? merged.shortcutLineDown : DEFAULT_SETTINGS.shortcutLineDown;
  cleaned.shortcutMultiSelect = typeof merged.shortcutMultiSelect === 'string' ? merged.shortcutMultiSelect : DEFAULT_SETTINGS.shortcutMultiSelect;
  cleaned.shortcutMultiSelectAll =
    typeof merged.shortcutMultiSelectAll === 'string' ? merged.shortcutMultiSelectAll : DEFAULT_SETTINGS.shortcutMultiSelectAll;
  cleaned.shortcutToggleSidebar = typeof merged.shortcutToggleSidebar === 'string' ? merged.shortcutToggleSidebar : DEFAULT_SETTINGS.shortcutToggleSidebar;
  cleaned.theme = ALLOWED_THEMES.includes(merged.theme) ? merged.theme : DEFAULT_SETTINGS.theme;
  cleaned.noteTemplate = typeof merged.noteTemplate === 'string' ? merged.noteTemplate : DEFAULT_SETTINGS.noteTemplate;
  cleaned.searchLimit = Number.isInteger(merged.searchLimit) ? Math.max(10, merged.searchLimit) : DEFAULT_SETTINGS.searchLimit;
  const allowedWeekStarts = ['monday', 'sunday'];
  cleaned.weekStartsOn = allowedWeekStarts.includes((merged.weekStartsOn || '').toLowerCase())
    ? merged.weekStartsOn.toLowerCase()
    : DEFAULT_SETTINGS.weekStartsOn;
  return cleaned;
}

async function saveSettings(partial = {}) {
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...partial });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function buildDailyPath(dateStr, settings) {
  const tmpl = settings.dailyNotesTemplate || DEFAULT_SETTINGS.dailyNotesTemplate;
  const dir = settings.dailyNotesDir || '';
  const applied = tmpl.replace(/YYYY-MM-DD/g, dateStr);
  let rel = applied;
  if (!applied.includes('/') && dir) {
    rel = `${dir}/${applied}`;
  }
  const clean = rel.replace(/^\/+/, '');
  return toPosix(clean);
}

function updateFrontmatterTimestamp(content) {
  if (!content.startsWith('---')) return { content, updated: null };
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { content, updated: null };
  const block = match[1];
  const rest = content.slice(match[0].length);
  const lines = block.split('\n');
  const now = new Date().toISOString();
  let found = false;
  const updatedLines = lines.map((line) => {
    if (line.trim().startsWith('updated:')) {
      found = true;
      return `updated: ${now}`;
    }
    return line;
  });
  if (!found) {
    updatedLines.push(`updated: ${now}`);
  }
  const next = `---\n${updatedLines.join('\n')}\n---\n${rest}`;
  return { content: next, updated: now };
}

function applyNoteTemplate(template, ctx = {}) {
  const now = new Date().toISOString();
  const context = {
    created: now,
    updated: now,
    title: ctx.title || '',
    date: ctx.date || '',
    ...ctx
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => context[key] || '');
}

async function resolveWikiTarget(targetRaw) {
  if (!targetRaw) return null;
  const trimmed = targetRaw.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  const hasExt = /\.[a-z0-9]+$/i.test(trimmed);
  const candidateMd = hasExt ? trimmed : `${trimmed}.md`;
  const files = await walkVaultFiles();
  const normalizedCandidate = toPosix(candidateMd);
  const exact = files.find((f) => toPosix(f.rel) === normalizedCandidate);
  if (exact) return exact.rel;
  const base = path.basename(hasExt ? trimmed : candidateMd);
  const byBase = files.find((f) => path.basename(f.rel) === base);
  if (byBase) return byBase.rel;
  // fallback to basename without extension
  const baseNoExt = path.basename(trimmed, path.extname(trimmed));
  const byBaseNoExt = files.find((f) => path.basename(f.rel, path.extname(f.rel)) === baseNoExt);
  if (byBaseNoExt) return byBaseNoExt.rel;
  return toPosix(candidateMd); // allow creation fallback
}

async function listDirectory(relDir = '', sortOrder = DEFAULT_SETTINGS.fileSortOrder) {
  const dirPath = resolveVaultPath(relDir || '.');
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const mapped = [];
  for (const entry of entries) {
    // Skip node_modules or hidden server directories if they ever appear under the vault.
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = toPosix(path.join(relDir || '', entry.name));
    let stat;
    try {
      stat = await fs.stat(path.join(dirPath, entry.name));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    mapped.push({
      name: entry.name,
      path: rel,
      type: entry.isDirectory() ? 'dir' : 'file',
      size: stat.size,
      mtime: stat.mtimeMs
    });
  }
  return mapped.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    switch (sortOrder) {
      case 'mtime_asc':
        return a.mtime - b.mtime || a.name.localeCompare(b.name);
      case 'mtime_desc':
        return b.mtime - a.mtime || a.name.localeCompare(b.name);
      case 'name_desc':
        return b.name.localeCompare(a.name);
      case 'name_asc':
      default:
        return a.name.localeCompare(b.name);
    }
  });
}

function isMarkdownFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function isImageFile(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg')
  );
}

async function walkMarkdownFiles(relDir = '') {
  const start = resolveVaultPath(relDir || '.');
  const results = [];
  const stack = [{ dirPath: start, relPath: relDir || '' }];
  while (stack.length) {
    const { dirPath, relPath } = stack.pop();
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const childRel = path.join(relPath, entry.name);
      const childFull = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dirPath: childFull, relPath: childRel });
        continue;
      }
      if (!isMarkdownFile(entry.name)) continue;
      try {
        await fs.access(childFull);
        results.push({ rel: toPosix(childRel), full: childFull });
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
    }
  }
  return results;
}

async function walkVaultFiles(relDir = '') {
  const start = resolveVaultPath(relDir || '.');
  const results = [];
  const stack = [{ dirPath: start, relPath: relDir || '' }];
  while (stack.length) {
    const { dirPath, relPath } = stack.pop();
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const childRel = path.join(relPath, entry.name);
      const childFull = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dirPath: childFull, relPath: childRel });
        continue;
      }
      try {
        await fs.access(childFull);
        results.push({ rel: toPosix(childRel), full: childFull });
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
    }
  }
  return results;
}

function extractDatesFromName(name) {
  const dates = new Set();
  const isoMatch = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    dates.add(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
  }
  const compactMatch = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    dates.add(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`);
  }
  return [...dates];
}

async function collectCalendarDates() {
  const mdFiles = await walkMarkdownFiles();
  const found = new Set();
  for (const file of mdFiles) {
    const dates = extractDatesFromName(path.basename(file.rel));
    for (const d of dates) found.add(d);
  }
  return [...found].sort();
}

async function searchVault(query) {
  const q = query.toLowerCase();
  const matchesNames = [];
  const matchesContent = [];
  const mdFiles = await walkMarkdownFiles();
  const settings = await loadSettings();
  const limit = settings.searchLimit || MAX_SEARCH_RESULTS;
  for (const file of mdFiles) {
    if (matchesNames.length + matchesContent.length >= limit) break;
    const base = path.basename(file.rel).toLowerCase();
    if (base.includes(q)) {
      matchesNames.push({ path: file.rel, snippet: 'filename match' });
      continue;
    }
  }
  for (const file of mdFiles) {
    if (matchesNames.length + matchesContent.length >= limit) break;
    let text;
    try {
      text = await fs.readFile(file.full, 'utf8');
    } catch {
      continue;
    }
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + 80);
    const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    matchesContent.push({ path: file.rel, snippet });
  }
  return [...matchesNames, ...matchesContent];
}

function requireAuth(authUser) {
  return (req, res, next) => {
    if (req.session && req.session.user === authUser) return next();
    return res.status(401).json({ error: 'auth_required' });
  };
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // Persist login for a week so returning users stay signed in.
        maxAge: 7 * 24 * 60 * 60 * 1000
      }
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, vault: VAULT_ROOT });
  });

  app.get('/api/session', (req, res) => {
    res.json({ authenticated: req.session?.user === AUTH_USER });
  });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === AUTH_USER && password === AUTH_PASS) {
      req.session.user = AUTH_USER;
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: 'invalid_credentials' });
  });

  app.post('/api/logout', requireAuth(AUTH_USER), (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.use('/vault', requireAuth(AUTH_USER), express.static(VAULT_ROOT));

  app.get('/api/list', requireAuth(AUTH_USER), async (req, res) => {
    try {
      const dir = (req.query.dir || '').toString();
      const settings = await loadSettings();
      const listing = await listDirectory(dir, settings.fileSortOrder);
      res.json({ items: listing });
    } catch (err) {
      res.status(400).json({ error: 'list_failed', message: err.message });
    }
  });

  app.get('/api/file', requireAuth(AUTH_USER), async (req, res) => {
    const rel = (req.query.path || '').toString();
    try {
      const filePath = resolveVaultPath(rel);
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await fs.stat(filePath);
      res.json({ path: toPosix(rel), content, mtime: stat.mtimeMs });
    } catch (err) {
      res.status(404).json({ error: 'read_failed', message: err.message });
    }
  });

  app.post('/api/file/save', requireAuth(AUTH_USER), async (req, res) => {
    const { path: rel, content } = req.body || {};
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      const filePath = resolveVaultPath(rel);
      const { content: adjusted } = updateFrontmatterTimestamp(content || '');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, adjusted, 'utf8');
      const stat = await fs.stat(filePath);
      res.json({ ok: true, mtime: stat.mtimeMs });
    } catch (err) {
      res.status(400).json({ error: 'save_failed', message: err.message });
    }
  });

  app.post('/api/file/create', requireAuth(AUTH_USER), async (req, res) => {
    const { path: rel, content } = req.body || {};
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      const settings = await loadSettings();
      const filePath = resolveVaultPath(rel);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const initial =
        typeof content === 'string' && content.length
          ? content
          : applyNoteTemplate(settings.noteTemplate || DEFAULT_SETTINGS.noteTemplate, { title: rel });
      await fs.writeFile(filePath, initial, { flag: 'wx', encoding: 'utf8' });
      res.json({ ok: true, path: toPosix(rel) });
    } catch (err) {
      if (err.code === 'EEXIST') {
        return res.json({ ok: false, reason: 'exists', path: toPosix(rel) });
      }
      res.status(400).json({ error: 'create_failed', message: err.message });
    }
  });

  app.post('/api/file/rename', requireAuth(AUTH_USER), async (req, res) => {
    const { oldPath, newPath } = req.body || {};
    if (!oldPath || !newPath) return res.status(400).json({ error: 'path_required' });
    try {
      const from = resolveVaultPath(oldPath);
      const to = resolveVaultPath(newPath);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: 'rename_failed', message: err.message });
    }
  });

  app.post('/api/file/delete', requireAuth(AUTH_USER), async (req, res) => {
    const { path: rel } = req.body || {};
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      const filePath = resolveVaultPath(rel);
      const stat = await fs.lstat(filePath);
      if (!stat.isFile()) throw new Error('Only file deletion is allowed');
      await fs.unlink(filePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: 'delete_failed', message: err.message });
    }
  });

  app.get('/api/search', requireAuth(AUTH_USER), async (req, res) => {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'query_required' });
    try {
      const results = await searchVault(q);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: 'search_failed', message: err.message });
    }
  });

  app.get('/api/calendar/dates', requireAuth(AUTH_USER), async (_req, res) => {
    try {
      const dates = await collectCalendarDates();
      res.json({ dates });
    } catch (err) {
      res.status(500).json({ error: 'calendar_failed', message: err.message });
    }
  });

  app.post('/api/day', requireAuth(AUTH_USER), async (req, res) => {
    const { date, template } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date_required' });
    const settings = await loadSettings();
    const relPath = buildDailyPath(date, settings);
    const filePath = resolveVaultPath(relPath);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (!fsSync.existsSync(filePath)) {
        const tpl = template || settings.noteTemplate || DEFAULT_SETTINGS.noteTemplate;
        const initial = applyNoteTemplate(tpl, { date, title: date });
        await fs.writeFile(filePath, initial, 'utf8');
      }
      res.json({ ok: true, path: relPath });
    } catch (err) {
      res.status(400).json({ error: 'day_failed', message: err.message });
    }
  });

  app.get('/api/settings', requireAuth(AUTH_USER), async (_req, res) => {
    try {
      const settings = await loadSettings();
      res.json({ settings, defaults: DEFAULT_SETTINGS });
    } catch (err) {
      res.status(500).json({ error: 'settings_failed', message: err.message });
    }
  });

  app.post('/api/settings', requireAuth(AUTH_USER), async (req, res) => {
    try {
      const next = await saveSettings(req.body || {});
      res.json({ ok: true, settings: next });
    } catch (err) {
      res.status(400).json({ error: 'settings_failed', message: err.message });
    }
  });

  app.get('/api/project-readme', requireAuth(AUTH_USER), async (_req, res) => {
    try {
      const content = await fs.readFile(PROJECT_README, 'utf8');
      res.json({ path: 'README.md', content });
    } catch (err) {
      res.status(404).json({ error: 'readme_not_found', message: err.message });
    }
  });

  app.post('/api/project-readme', requireAuth(AUTH_USER), async (req, res) => {
    try {
      const { content } = req.body || {};
      if (typeof content !== 'string') return res.status(400).json({ error: 'content_required' });
      await fs.writeFile(PROJECT_README, content, 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'readme_save_failed', message: err.message });
    }
  });

  app.get('/api/images', requireAuth(AUTH_USER), async (_req, res) => {
    try {
      const files = await walkVaultFiles();
      const images = files
        .filter((f) => isImageFile(f.rel))
        .map((f) => ({ path: toPosix(f.rel), name: path.basename(f.rel) }))
        .slice(0, 500);
      res.json({ images });
    } catch (err) {
      res.status(500).json({ error: 'images_failed', message: err.message });
    }
  });

  app.get('/api/files-flat', requireAuth(AUTH_USER), async (_req, res) => {
    try {
      const files = await walkVaultFiles();
      const flat = files.map((f) => ({
        path: toPosix(f.rel),
        name: path.basename(f.rel),
        type: 'file'
      }));
      res.json({ files: flat.slice(0, 2000) });
    } catch (err) {
      res.status(500).json({ error: 'files_failed', message: err.message });
    }
  });

  app.get('/api/resolve-wiki', requireAuth(AUTH_USER), async (req, res) => {
    const target = (req.query.target || '').toString();
    if (!target) return res.status(400).json({ error: 'target_required' });
    try {
      const resolved = await resolveWikiTarget(target);
      if (!resolved) return res.status(404).json({ error: 'not_found' });
      res.json({ path: toPosix(resolved) });
    } catch (err) {
      res.status(500).json({ error: 'resolve_failed', message: err.message });
    }
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/vault/')) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    return next();
  });

  return app;
}

function start() {
  if (!fsSync.existsSync(VAULT_ROOT)) {
    fsSync.mkdirSync(VAULT_ROOT, { recursive: true });
  }
  const app = buildApp();
  app.listen(DEFAULT_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${DEFAULT_PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { buildApp, resolveVaultPath, VAULT_ROOT };
