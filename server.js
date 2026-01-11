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
const VAULT_ROOT = path.resolve(process.env.VAULT_ROOT || DEFAULT_VAULT);
const SETTINGS_PATH = path.resolve(process.env.SETTINGS_PATH || path.join(VAULT_ROOT, 'settings-md.md'));
const MAX_SEARCH_RESULTS = 50;
const EXPORT_PDF_ENABLED = process.env.EXPORT_PDF_ENABLED !== 'false';
const EXPORT_DOCX_ENABLED = process.env.EXPORT_DOCX_ENABLED !== 'false';
const EXPORT_PDF_PAGE_SIZE = process.env.EXPORT_PDF_PAGE_SIZE || 'A4';
const EXPORT_PDF_MARGIN = process.env.EXPORT_PDF_MARGIN || '0.75in';

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
  searchLimit: 1000,
  lintEnabled: true,
  lintOnSave: true,
  lintNoBlankList: true,
  lintTrimTrailing: true,
  lintHeadingLevels: true,
  mermaidTheme: 'auto',
  mermaidFontSize: 14,
  mermaidFontFamily: 'mono',
  mermaidFontFamilyCustom: '',
  sidebarFontSize: 0.85
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
const MERMAID_THEMES = ['auto', 'default', 'neutral', 'dark', 'forest', 'base'];
const MERMAID_FONT_FAMILIES = ['auto', 'sans', 'serif', 'mono', 'custom'];
const MERMAID_FONT_FAMILY_MAP = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  serif: 'ui-serif, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
};
const DARK_THEMES = new Set(['midnight', 'dracula', 'monokai', 'solarized', 'tokyonight', 'nord', 'gruvbox', 'catppuccin']);
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

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str = '') {
  return str.replace(/"/g, '&quot;');
}

function stripFrontmatter(text = '') {
  if (!text.startsWith('---')) return text;
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return text;
  return text.slice(match[0].length);
}

function extractFrontmatterTitle(text = '') {
  if (!text.startsWith('---')) return null;
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const block = match[1];
  const titleLine = block
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('title:'));
  if (!titleLine) return null;
  return titleLine.split(':').slice(1).join(':').trim() || null;
}

function getMermaidTheme(themeName) {
  return DARK_THEMES.has((themeName || '').toLowerCase()) ? 'dark' : 'default';
}

function resolveThemeOverride(raw, fallback) {
  const theme = (raw || '').toString().toLowerCase();
  if (ALLOWED_THEMES.includes(theme)) return theme;
  return fallback || DEFAULT_SETTINGS.theme;
}

function resolveMermaidTheme(appTheme, override) {
  const chosen = (override || '').toString().toLowerCase();
  if (MERMAID_THEMES.includes(chosen) && chosen !== 'auto') return chosen;
  return getMermaidTheme(appTheme);
}

function resolveMermaidFontSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return null;
  const clamped = Math.min(Math.max(Math.round(size), 8), 32);
  return clamped;
}

function resolveMermaidFontFamily(value, custom) {
  const key = (value || '').toString().toLowerCase();
  if (key === 'custom') {
    const customValue = (custom || '').toString().trim();
    return customValue || null;
  }
  return MERMAID_FONT_FAMILY_MAP[key] || null;
}

let exportDeps = null;
let exportCssCache = null;
const CHROMIUM_PATHS = [
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

function loadExportDeps() {
  if (exportDeps) return exportDeps;
  try {
    const { marked } = require('marked');
    const { JSDOM } = require('jsdom');
    const htmlToDocx = require('html-to-docx');
    const puppeteer = require('puppeteer');
    const mermaidPath = require.resolve('mermaid/dist/mermaid.min.js');
    exportDeps = { marked, JSDOM, htmlToDocx, puppeteer, mermaidPath };
    return exportDeps;
  } catch (err) {
    err.message = `Export dependencies missing: ${err.message}`;
    throw err;
  }
}

function resolveChromiumExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fsSync.existsSync(envPath)) return envPath;
  for (const candidate of CHROMIUM_PATHS) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return null;
}

async function loadExportCss() {
  if (exportCssCache) return exportCssCache;
  const cssPath = path.join(__dirname, 'public', 'styles.css');
  try {
    exportCssCache = await fs.readFile(cssPath, 'utf8');
  } catch {
    exportCssCache = '';
  }
  return exportCssCache;
}

function parseSettingsFile(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const fenced = /```json\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }
  const inline = /{[\s\S]*}/.exec(raw);
  if (inline?.[0]) {
    try {
      return JSON.parse(inline[0]);
    } catch {
      // continue
    }
  }
  return null;
}

function parseSettingsFrontmatter(raw) {
  if (!raw || !raw.startsWith('---')) return {};
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const meta = {};
  lines.forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (!key) return;
    const value = rest.join(':').trim();
    meta[key.trim()] = value;
  });
  return meta;
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = parseSettingsFile(raw);
    if (!parsed) throw new Error('settings_parse_failed');
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function getSettingsMtime() {
  try {
    const stat = await fs.stat(SETTINGS_PATH);
    return stat.mtimeMs;
  } catch {
    return null;
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
  cleaned.lintEnabled = typeof merged.lintEnabled === 'boolean' ? merged.lintEnabled : DEFAULT_SETTINGS.lintEnabled;
  cleaned.lintOnSave = typeof merged.lintOnSave === 'boolean' ? merged.lintOnSave : DEFAULT_SETTINGS.lintOnSave;
  cleaned.lintNoBlankList = typeof merged.lintNoBlankList === 'boolean' ? merged.lintNoBlankList : DEFAULT_SETTINGS.lintNoBlankList;
  cleaned.lintTrimTrailing = typeof merged.lintTrimTrailing === 'boolean' ? merged.lintTrimTrailing : DEFAULT_SETTINGS.lintTrimTrailing;
  cleaned.lintHeadingLevels = typeof merged.lintHeadingLevels === 'boolean' ? merged.lintHeadingLevels : DEFAULT_SETTINGS.lintHeadingLevels;
  cleaned.mermaidTheme = MERMAID_THEMES.includes((merged.mermaidTheme || '').toLowerCase())
    ? merged.mermaidTheme.toLowerCase()
    : DEFAULT_SETTINGS.mermaidTheme;
  cleaned.mermaidFontSize = resolveMermaidFontSize(merged.mermaidFontSize) || DEFAULT_SETTINGS.mermaidFontSize;
  cleaned.mermaidFontFamily = MERMAID_FONT_FAMILIES.includes((merged.mermaidFontFamily || '').toLowerCase())
    ? merged.mermaidFontFamily.toLowerCase()
    : DEFAULT_SETTINGS.mermaidFontFamily;
  cleaned.mermaidFontFamilyCustom = typeof merged.mermaidFontFamilyCustom === 'string' ? merged.mermaidFontFamilyCustom : '';
  const sidebarSize =
    typeof merged.sidebarFontSize === 'number'
      ? merged.sidebarFontSize
      : typeof merged.sidebarFontSize === 'string'
        ? Number(merged.sidebarFontSize.replace(',', '.'))
        : NaN;
  if (Number.isFinite(sidebarSize)) {
    cleaned.sidebarFontSize = Math.min(Math.max(sidebarSize, 0.6), 2.0);
  } else {
    cleaned.sidebarFontSize = DEFAULT_SETTINGS.sidebarFontSize;
  }
  const allowedWeekStarts = ['monday', 'sunday'];
  cleaned.weekStartsOn = allowedWeekStarts.includes((merged.weekStartsOn || '').toLowerCase())
    ? merged.weekStartsOn.toLowerCase()
    : DEFAULT_SETTINGS.weekStartsOn;
  return cleaned;
}

async function saveSettings(partial = {}) {
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => '');
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...partial });
  const now = new Date().toISOString();
  const meta = parseSettingsFrontmatter(raw);
  const created = meta.created || now;
  const frontmatter = `---\ncreated: ${created}\nupdated: ${now}\n---\n`;
  const body = `${JSON.stringify(next, null, 2)}\n`;
  await fs.writeFile(SETTINGS_PATH, `${frontmatter}${body}`, 'utf8');
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
  const trimmed = targetRaw.split('|')[0].trim().replace(/^\/+/, '');
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

async function replaceAsync(str, regex, replacer) {
  const matches = [];
  str.replace(regex, (...args) => {
    matches.push(args);
    return '';
  });
  if (!matches.length) return str;
  let result = '';
  let lastIndex = 0;
  for (const match of matches) {
    const [full, ...rest] = match;
    const index = match[match.length - 2];
    result += str.slice(lastIndex, index);
    // eslint-disable-next-line no-await-in-loop
    result += await replacer(full, ...rest);
    lastIndex = index + full.length;
  }
  result += str.slice(lastIndex);
  return result;
}

async function expandWikiLinksForExport(text) {
  let out = text || '';
  out = await replaceAsync(out, /!\[\[([^\]]+)\]\]/g, async (_m, p1) => {
    const raw = (p1 || '').trim();
    const target = raw.split('|')[0].trim();
    if (!target) return '';
    const resolved = await resolveWikiTarget(target);
    const rel = resolved ? toPosix(resolved) : target.replace(/^\/+/, '');
    if (isImageFile(rel)) {
      return `![](/vault/${rel})`;
    }
    return `[${rel}](${rel})`;
  });
  out = await replaceAsync(out, /\[\[([^\]]+)\]\]/g, async (_m, p1) => {
    const [targetRaw, labelRaw] = (p1 || '').split('|');
    const target = (targetRaw || '').trim();
    if (!target) return '';
    const label = (labelRaw || target).trim();
    const resolved = await resolveWikiTarget(target);
    const rel = resolved ? toPosix(resolved) : target.replace(/^\/+/, '');
    return `[${label}](${rel})`;
  });
  return out;
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

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseMonthParam(raw) {
  const match = /^(\d{4})-(\d{2})$/.exec(raw || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function parseDateParam(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day, date };
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

function resolveExportResource(href, baseDir) {
  if (!href) return '';
  if (/^(https?:|mailto:|data:|tel:)/i.test(href)) return href;
  if (href.startsWith('/vault/')) {
    return toPosix(href.replace(/^\/+vault\//, ''));
  }
  if (href.startsWith('/')) {
    return toPosix(href.replace(/^\/+/, ''));
  }
  const clean = href.replace(/^\.\//, '').replace(/^\/+/, '');
  const prefix = baseDir ? `${baseDir}/` : '';
  return toPosix(path.posix.join(prefix, clean));
}

function renderMarkdownToHtmlForExport(text, baseDir) {
  const { marked } = loadExportDeps();
  const renderer = new marked.Renderer();
  renderer.link = (href, title, linkText) => {
    const url = resolveExportResource(href, baseDir);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeAttr(url)}"${t}>${linkText}</a>`;
  };
  renderer.image = (href, title, alt) => {
    const url = resolveExportResource(href, baseDir);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeAttr(url)}" alt="${escapeHtml(alt || '')}"${t}>`;
  };
  renderer.code = (code, lang) => {
    if ((lang || '').toLowerCase() === 'mermaid') {
      return `<div class="mermaid">${escapeHtml(code)}</div>`;
    }
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  };
  marked.setOptions({ gfm: true, breaks: true });
  return marked.parse(text, { renderer });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function inlineImages(html, baseDir) {
  const { JSDOM } = loadExportDeps();
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const images = [...document.querySelectorAll('img')];
  for (const img of images) {
    const src = img.getAttribute('src') || '';
    if (!src || /^(https?:|mailto:|data:|tel:)/i.test(src)) continue;
    const normalized = src.replace(/^\/?vault\//, '').split('?')[0];
    const rel = toPosix(normalized);
    let filePath;
    try {
      filePath = resolveVaultPath(rel);
    } catch {
      continue;
    }
    try {
      const data = await fs.readFile(filePath);
      const mime = getMimeType(filePath);
      img.setAttribute('src', `data:${mime};base64,${data.toString('base64')}`);
    } catch {
      // skip missing files
    }
  }
  return document.body.innerHTML;
}

async function buildExportStyles(themeName) {
  const baseCss = await loadExportCss();
  return `
    ${baseCss}
    body {
      margin: 0;
      padding: 32px;
      background: #ffffff !important;
      background-image: none !important;
      color: var(--text);
      font-family: "Space Grotesk", "Noto Sans CJK SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
        "Source Han Sans SC", "Segoe UI", sans-serif;
    }
    body[data-theme] {
      --bg: #ffffff;
      --card: #ffffff;
    }
    .doc-title {
      font-size: 28px;
      margin: 0 0 24px;
    }
    .preview {
      padding: 0;
      background: var(--card);
    }
    .preview img {
      box-shadow: none;
      cursor: default;
    }
  `;
}

async function buildExportDocument(bodyHtml, title, themeName) {
  const titleHtml = title ? `<h1 class="doc-title">${escapeHtml(title)}</h1>` : '';
  const styles = await buildExportStyles(themeName);
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>${styles}</style>
    </head>
    <body data-theme="${escapeAttr(themeName || '')}">
      ${titleHtml}
      <div class="preview">${bodyHtml}</div>
    </body>
  </html>`;
}

async function withMermaidPage(html, mermaidConfig, handler) {
  const { puppeteer, mermaidPath } = loadExportDeps();
  const executablePath = resolveChromiumExecutable();
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: executablePath || undefined
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: mermaidPath });
    await page.evaluate((config) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: config.theme,
        themeVariables: config.themeVariables || {}
      });
      mermaid.init(undefined, document.querySelectorAll('.mermaid'));
    }, mermaidConfig);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await handler(page);
  } finally {
    await browser.close();
  }
}

function extractMermaidBlocks(text) {
  const blocks = [];
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function normalizeWikiTarget(raw) {
  const target = (raw || '').split('|')[0].trim();
  return target.replace(/^[./]+/, '');
}

function normalizeMarkdownLink(raw) {
  const target = (raw || '').trim();
  if (!target) return null;
  if (/^(https?:|mailto:|tel:|data:)/i.test(target)) return null;
  const cleaned = target.split(/[?#]/)[0].trim();
  if (!cleaned) return null;
  return cleaned.replace(/^\/?vault\//, '').replace(/^[./]+/, '');
}

function isTargetMatch(targetBaseLower, candidate) {
  if (!candidate) return false;
  const base = path.posix.basename(candidate);
  const noExt = base.replace(/\.[^/.]+$/, '');
  return noExt.toLowerCase() === targetBaseLower;
}

function trimSnippet(line) {
  const trimmed = (line || '').trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}

function sanitizeHeaderValue(value) {
  return (value || '').toString().replace(/[\r\n"]/g, '').trim();
}

function toAsciiFilename(filename, fallbackExt) {
  const clean = sanitizeHeaderValue(filename);
  const base = clean.replace(/[^A-Za-z0-9._-]/g, '_') || 'export';
  if (fallbackExt && !base.toLowerCase().endsWith(fallbackExt.toLowerCase())) {
    return `${base}${fallbackExt}`;
  }
  return base;
}

function setDownloadHeaders(res, filename, mimeType, fallbackExt) {
  const safeName = sanitizeHeaderValue(filename);
  const asciiName = toAsciiFilename(safeName, fallbackExt);
  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName || asciiName)}`
  );
}

function getBaseDir(relPath) {
  const dir = toPosix(path.posix.dirname(relPath));
  return dir === '.' ? '' : dir;
}

async function buildExportHtmlForNote(relPath, settings, themeOverride) {
  const filePath = resolveVaultPath(relPath);
  const content = await fs.readFile(filePath, 'utf8');
  const baseDir = getBaseDir(relPath);
  const title = extractFrontmatterTitle(content) || path.basename(relPath, path.extname(relPath));
  const stripped = stripFrontmatter(content);
  const expanded = await expandWikiLinksForExport(stripped);
  const bodyHtml = renderMarkdownToHtmlForExport(expanded, baseDir);
  const inlined = await inlineImages(bodyHtml, baseDir);
  const themeName = resolveThemeOverride(themeOverride, settings.theme || DEFAULT_SETTINGS.theme);
  const html = await buildExportDocument(inlined, title, themeName);
  return { html, content, title, baseDir, themeName };
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

  app.get('/api/calendar/changes', requireAuth(AUTH_USER), async (req, res) => {
    const parsed = parseMonthParam((req.query.month || '').toString());
    if (!parsed) return res.status(400).json({ error: 'month_required' });
    const { year, month } = parsed;
    try {
      const files = await walkMarkdownFiles();
      const changes = {};
      for (const file of files) {
        let stat;
        try {
          stat = await fs.stat(file.full);
        } catch {
          continue;
        }
        const mtime = stat.mtime;
        if (mtime.getFullYear() !== year || mtime.getMonth() + 1 !== month) continue;
        const dateStr = formatDateLocal(mtime);
        if (!changes[dateStr]) changes[dateStr] = [];
        if (changes[dateStr].length >= 50) continue;
        changes[dateStr].push(file.rel);
      }
      Object.values(changes).forEach((list) => list.sort());
      res.json({ month: `${year}-${String(month).padStart(2, '0')}`, changes });
    } catch (err) {
      res.status(500).json({ error: 'calendar_failed', message: err.message });
    }
  });

  app.get('/api/calendar/day-files', requireAuth(AUTH_USER), async (req, res) => {
    const parsed = parseDateParam((req.query.date || '').toString());
    if (!parsed) return res.status(400).json({ error: 'date_required' });
    const includeDaily = String(req.query.includeDaily || '').toLowerCase() === 'true';
    try {
      const settings = await loadSettings();
      const dailyPath = buildDailyPath(formatDateLocal(parsed.date), settings).toLowerCase();
      const start = new Date(parsed.year, parsed.month - 1, parsed.day);
      const end = new Date(parsed.year, parsed.month - 1, parsed.day + 1);
      const files = await walkMarkdownFiles();
      const entries = [];
      for (const file of files) {
        if (!includeDaily && file.rel.toLowerCase() === dailyPath) continue;
        let stat;
        try {
          stat = await fs.stat(file.full);
        } catch {
          continue;
        }
        const created = stat.ctime >= start && stat.ctime < end;
        const modified = stat.mtime >= start && stat.mtime < end;
        if (!created && !modified) continue;
        entries.push({
          path: file.rel,
          created,
          modified,
          ctime: stat.ctime.toISOString(),
          mtime: stat.mtime.toISOString()
        });
      }
      entries.sort((a, b) => {
        const aTime = Math.max(new Date(a.mtime).getTime(), new Date(a.ctime).getTime());
        const bTime = Math.max(new Date(b.mtime).getTime(), new Date(b.ctime).getTime());
        if (aTime !== bTime) return bTime - aTime;
        return a.path.localeCompare(b.path);
      });
      const limit = 200;
      res.json({ date: formatDateLocal(parsed.date), files: entries.slice(0, limit) });
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
      const settingsMtime = await getSettingsMtime();
      res.json({ settings, defaults: DEFAULT_SETTINGS, settingsMtime, settingsPath: SETTINGS_PATH, vaultRoot: VAULT_ROOT });
    } catch (err) {
      res.status(500).json({ error: 'settings_failed', message: err.message });
    }
  });

  app.post('/api/settings', requireAuth(AUTH_USER), async (req, res) => {
    try {
      const next = await saveSettings(req.body || {});
      const settingsMtime = await getSettingsMtime();
      res.json({ ok: true, settings: next, settingsMtime, settingsPath: SETTINGS_PATH, vaultRoot: VAULT_ROOT });
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

  app.get('/api/export/pdf', requireAuth(AUTH_USER), async (req, res) => {
    if (!EXPORT_PDF_ENABLED) return res.status(404).json({ error: 'export_disabled' });
    const rel = (req.query.path || '').toString();
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      const settings = await loadSettings();
      const themeOverride = (req.query.theme || '').toString();
      const mermaidOverride = (req.query.mermaidTheme || '').toString();
      const mermaidFontSize = req.query.mermaidFontSize;
      const mermaidFontFamily = (req.query.mermaidFontFamily || '').toString();
      const mermaidFontFamilyCustom = (req.query.mermaidFontFamilyCustom || '').toString();
      const { html, title, themeName } = await buildExportHtmlForNote(rel, settings, themeOverride);
      const mermaidTheme = resolveMermaidTheme(themeName, mermaidOverride || settings.mermaidTheme);
      const themeVariables = {};
      const fontSize = resolveMermaidFontSize(mermaidFontSize ?? settings.mermaidFontSize);
      const fontFamily = resolveMermaidFontFamily(
        mermaidFontFamily || settings.mermaidFontFamily,
        mermaidFontFamilyCustom || settings.mermaidFontFamilyCustom
      );
      if (fontSize) themeVariables.fontSize = `${fontSize}px`;
      if (fontFamily) themeVariables.fontFamily = fontFamily;
      const mermaidConfig = { theme: mermaidTheme, themeVariables };
      const pdfBuffer = await withMermaidPage(html, mermaidConfig, (page) =>
        page.pdf({
          format: EXPORT_PDF_PAGE_SIZE,
          printBackground: true,
          margin: {
            top: EXPORT_PDF_MARGIN,
            bottom: EXPORT_PDF_MARGIN,
            left: EXPORT_PDF_MARGIN,
            right: EXPORT_PDF_MARGIN
          }
        })
      );
      const filename = `${title || path.basename(rel, path.extname(rel))}.pdf`;
      setDownloadHeaders(res, filename, 'application/pdf', '.pdf');
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ error: 'export_failed', message: err.message });
    }
  });

  app.get('/api/export/docx', requireAuth(AUTH_USER), async (req, res) => {
    if (!EXPORT_DOCX_ENABLED) return res.status(404).json({ error: 'export_disabled' });
    const rel = (req.query.path || '').toString();
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      const { htmlToDocx } = loadExportDeps();
      const settings = await loadSettings();
      const themeOverride = (req.query.theme || '').toString();
      const mermaidOverride = (req.query.mermaidTheme || '').toString();
      const mermaidFontSize = req.query.mermaidFontSize;
      const mermaidFontFamily = (req.query.mermaidFontFamily || '').toString();
      const mermaidFontFamilyCustom = (req.query.mermaidFontFamilyCustom || '').toString();
      const { html, title, themeName } = await buildExportHtmlForNote(rel, settings, themeOverride);
      const mermaidTheme = resolveMermaidTheme(themeName, mermaidOverride || settings.mermaidTheme);
      const themeVariables = {};
      const fontSize = resolveMermaidFontSize(mermaidFontSize ?? settings.mermaidFontSize);
      const fontFamily = resolveMermaidFontFamily(
        mermaidFontFamily || settings.mermaidFontFamily,
        mermaidFontFamilyCustom || settings.mermaidFontFamilyCustom
      );
      if (fontSize) themeVariables.fontSize = `${fontSize}px`;
      if (fontFamily) themeVariables.fontFamily = fontFamily;
      const mermaidConfig = { theme: mermaidTheme, themeVariables };
      const htmlWithMermaid = await withMermaidPage(html, mermaidConfig, (page) =>
        page.evaluate(() => {
          document.querySelectorAll('.mermaid').forEach((el) => {
            const svg = el.querySelector('svg');
            if (!svg) return;
            const serialized = new XMLSerializer().serializeToString(svg);
            const encoded = btoa(unescape(encodeURIComponent(serialized)));
            const img = document.createElement('img');
            img.setAttribute('src', `data:image/svg+xml;base64,${encoded}`);
            img.setAttribute('alt', 'Mermaid diagram');
            el.replaceWith(img);
          });
          document.querySelectorAll('script').forEach((el) => el.remove());
          return document.documentElement.outerHTML;
        })
      );
      const docxBuffer = await htmlToDocx(htmlWithMermaid);
      const filename = `${title || path.basename(rel, path.extname(rel))}.docx`;
      setDownloadHeaders(
        res,
        filename,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.docx'
      );
      res.send(docxBuffer);
    } catch (err) {
      res.status(500).json({ error: 'export_failed', message: err.message });
    }
  });

  app.get('/api/export/mermaid-image', requireAuth(AUTH_USER), async (req, res) => {
    const rel = (req.query.path || '').toString();
    const index = Number(req.query.index);
    const format = (req.query.format || '').toString().toLowerCase();
    if (!rel) return res.status(400).json({ error: 'path_required' });
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'index_required' });
    if (!['png', 'svg'].includes(format)) return res.status(400).json({ error: 'format_required' });
    try {
      const settings = await loadSettings();
      const themeOverride = (req.query.theme || '').toString();
      const mermaidOverride = (req.query.mermaidTheme || '').toString();
      const mermaidFontSize = req.query.mermaidFontSize;
      const mermaidFontFamily = (req.query.mermaidFontFamily || '').toString();
      const mermaidFontFamilyCustom = (req.query.mermaidFontFamilyCustom || '').toString();
      const filePath = resolveVaultPath(rel);
      const content = await fs.readFile(filePath, 'utf8');
      const blocks = extractMermaidBlocks(content);
      const block = blocks[index];
      if (!block) return res.status(404).json({ error: 'diagram_not_found' });
      const themeName = resolveThemeOverride(themeOverride, settings.theme || DEFAULT_SETTINGS.theme);
      const mermaidTheme = resolveMermaidTheme(themeName, mermaidOverride || settings.mermaidTheme);
      const html = await buildExportDocument(`<div class="mermaid">${escapeHtml(block)}</div>`, '', themeName);
      const themeVariables = {};
      const fontSize = resolveMermaidFontSize(mermaidFontSize ?? settings.mermaidFontSize);
      const fontFamily = resolveMermaidFontFamily(
        mermaidFontFamily || settings.mermaidFontFamily,
        mermaidFontFamilyCustom || settings.mermaidFontFamilyCustom
      );
      if (fontSize) themeVariables.fontSize = `${fontSize}px`;
      if (fontFamily) themeVariables.fontFamily = fontFamily;
      const mermaidConfig = { theme: mermaidTheme, themeVariables };
      const result = await withMermaidPage(html, mermaidConfig, async (page) => {
        const svgHandle = await page.$('.mermaid svg');
        if (!svgHandle) throw new Error('mermaid_render_failed');
        if (format === 'svg') {
          return page.evaluate(() => document.querySelector('.mermaid svg')?.outerHTML || '');
        }
        return svgHandle.screenshot({ type: 'png' });
      });
      const filename = `${path.basename(rel, path.extname(rel))}-diagram-${index + 1}.${format}`;
      if (format === 'svg') {
        setDownloadHeaders(res, filename, 'image/svg+xml', '.svg');
        res.send(result);
        return;
      }
      setDownloadHeaders(res, filename, 'image/png', '.png');
      res.send(result);
    } catch (err) {
      res.status(500).json({ error: 'export_failed', message: err.message });
    }
  });

  app.get('/api/backlinks', requireAuth(AUTH_USER), async (req, res) => {
    const rel = (req.query.path || '').toString();
    if (!rel) return res.status(400).json({ error: 'path_required' });
    try {
      resolveVaultPath(rel);
      const targetBase = path.basename(rel, path.extname(rel)).toLowerCase();
      const files = await walkMarkdownFiles();
      const backlinks = [];
      for (const file of files) {
        if (file.rel === rel) continue;
        let content;
        try {
          content = await fs.readFile(file.full, 'utf8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        let snippet = '';
        let matched = false;
        for (const line of lines) {
          if (matched) break;
          const wikiRegex = /!?\[\[([^\]]+)\]\]/g;
          let wikiMatch;
          while ((wikiMatch = wikiRegex.exec(line)) !== null) {
            const target = normalizeWikiTarget(wikiMatch[1]);
            if (isTargetMatch(targetBase, target)) {
              matched = true;
              snippet = trimSnippet(line);
              break;
            }
          }
          if (matched) break;
          const mdRegex = /\[[^\]]*\]\(([^)]+)\)/g;
          let mdMatch;
          while ((mdMatch = mdRegex.exec(line)) !== null) {
            const target = normalizeMarkdownLink(mdMatch[1]);
            if (isTargetMatch(targetBase, target)) {
              matched = true;
              snippet = trimSnippet(line);
              break;
            }
          }
        }
        if (matched) backlinks.push({ path: file.rel, snippet });
      }
      backlinks.sort((a, b) => a.path.localeCompare(b.path));
      res.json({ path: rel, backlinks });
    } catch (err) {
      res.status(500).json({ error: 'backlinks_failed', message: err.message });
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
