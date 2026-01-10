const DARK_THEMES = new Set(['midnight', 'dracula', 'monokai', 'solarized', 'tokyonight', 'nord', 'gruvbox', 'catppuccin']);
const MERMAID_THEMES = new Set(['auto', 'default', 'neutral', 'dark', 'forest', 'base']);
const MERMAID_FONT_FAMILIES = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  serif: 'ui-serif, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
};

function resolveMermaidTheme(appTheme, override) {
  const chosen = (override || '').toLowerCase();
  if (MERMAID_THEMES.has(chosen) && chosen !== 'auto') return chosen;
  return DARK_THEMES.has((appTheme || '').toLowerCase()) ? 'dark' : 'default';
}

function resolveMermaidFontSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return null;
  return Math.min(Math.max(Math.round(size), 8), 32);
}

function resolveMermaidFontFamily(value, customValue) {
  const key = (value || '').toLowerCase();
  if (key === 'custom') {
    const custom = (customValue || '').trim();
    return custom || null;
  }
  return MERMAID_FONT_FAMILIES[key] || null;
}

function updateMermaidTheme(appTheme, override, fontSize, fontFamily, fontFamilyCustom) {
  const theme = resolveMermaidTheme(appTheme, override);
  const themeVariables = {};
  const resolvedFamily = resolveMermaidFontFamily(fontFamily, fontFamilyCustom);
  const resolvedSize = resolveMermaidFontSize(fontSize);
  if (resolvedFamily) themeVariables.fontFamily = resolvedFamily;
  if (resolvedSize) themeVariables.fontSize = `${resolvedSize}px`;
  mermaid.initialize({ startOnLoad: false, theme, themeVariables });
}

updateMermaidTheme('light');

function rerenderMermaid(root) {
  const mermaidBlocks = root ? root.querySelectorAll('.mermaid') : [];
  if (!mermaidBlocks.length) return;
  mermaidBlocks.forEach((block) => {
    block.removeAttribute('data-processed');
    const svg = block.querySelector('svg');
    if (svg) svg.remove();
  });
  try {
    mermaid.init(undefined, mermaidBlocks);
  } catch (err) {
    console.error('Mermaid render failed', err);
  }
}

const state = {
  currentPath: null,
  currentDir: '',
  unsaved: false,
  calendarMonth: new Date(),
  calendarDates: new Set(),
  calendarWeeks: new Set(),
  calendarChanges: {},
  recentChanges: [],
  dayActivity: { date: null, files: [], selected: new Set(), includeDaily: false },
  hoverBound: false,
  lightboxBound: false,
  settings: {},
  history: [],
  historyIndex: -1,
  navigating: false,
  sidebarCollapsed: false,
  splitRatio: 0.5,
  images: [],
  files: [],
  filePathSet: new Set(),
  suggest: { active: false, items: [], index: -1, query: '', mode: 'link', loading: false },
  lastRenderedPreview: '',
  exporting: false
};

const els = {
  loginView: document.getElementById('login-view'),
  mainView: document.getElementById('main-view'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  username: document.getElementById('login-username'),
  password: document.getElementById('login-password'),
  currentPathInput: document.getElementById('current-path-input'),
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  message: document.getElementById('message'),
  unsaved: document.getElementById('unsaved-indicator'),
  fileList: document.getElementById('file-list'),
  fileTree: document.getElementById('file-tree'),
  breadcrumbs: document.getElementById('breadcrumbs'),
  refreshBtn: document.getElementById('refresh-btn'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  searchStatus: document.getElementById('search-status'),
  searchResults: document.getElementById('search-results'),
  newBtn: document.getElementById('new-note-btn'),
  backBtn: document.getElementById('back-btn'),
  forwardBtn: document.getElementById('forward-btn'),
  saveBtn: document.getElementById('save-btn'),
  renameBtn: document.getElementById('rename-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  calendarGrid: document.getElementById('calendar-grid'),
  calendarLabel: document.getElementById('calendar-label'),
  calendarPrev: document.getElementById('calendar-prev'),
  calendarNext: document.getElementById('calendar-next'),
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightbox-img'),
  settingsDailyDir: document.getElementById('settings-daily-dir'),
  settingsDailyTemplate: document.getElementById('settings-daily-template'),
  settingsWeeklyDir: document.getElementById('settings-weekly-dir'),
  settingsWeeklyTemplate: document.getElementById('settings-weekly-template'),
  settingsWeekStart: document.getElementById('settings-week-start'),
  settingsSortOrder: document.getElementById('settings-sort-order'),
  settingsShortcutBack: document.getElementById('settings-shortcut-back'),
  settingsShortcutForward: document.getElementById('settings-shortcut-forward'),
  settingsShortcutSave: document.getElementById('settings-shortcut-save'),
  settingsShortcutLineUp: document.getElementById('settings-shortcut-line-up'),
  settingsShortcutLineDown: document.getElementById('settings-shortcut-line-down'),
  settingsShortcutMultiSelect: document.getElementById('settings-shortcut-multiselect'),
  settingsShortcutMultiSelectAll: document.getElementById('settings-shortcut-multiselect-all'),
  settingsShortcutToggle: document.getElementById('settings-shortcut-toggle'),
  settingsTheme: document.getElementById('settings-theme'),
  settingsNoteTemplate: document.getElementById('settings-note-template'),
  settingsSearchLimit: document.getElementById('settings-search-limit'),
  settingsSave: document.getElementById('settings-save'),
  settingsStatus: document.getElementById('settings-status'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsBody: document.getElementById('settings-body'),
  toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
  workspace: document.getElementById('workspace'),
  panes: document.getElementById('panes'),
  resizer: document.getElementById('pane-resizer'),
  readmeBtn: document.getElementById('readme-btn'),
  readmeModal: document.getElementById('readme-modal'),
  readmeBody: document.getElementById('readme-body'),
  readmeClose: document.getElementById('readme-close'),
  imageSuggest: document.getElementById('image-suggest'),
  imageSuggestList: document.getElementById('image-suggest-list'),
  hoverPreview: document.getElementById('hover-preview'),
  hoverPreviewContent: document.getElementById('hover-preview-content'),
  replacePanel: document.getElementById('replace-panel'),
  replaceFind: document.getElementById('replace-find'),
  replaceWith: document.getElementById('replace-with'),
  replaceApply: document.getElementById('replace-apply'),
  replaceCancel: document.getElementById('replace-cancel'),
  replaceCount: document.getElementById('replace-count'),
  lintBtn: document.getElementById('lint-btn'),
  exportBtn: document.getElementById('export-btn'),
  exportMenu: document.getElementById('export-menu'),
  exportPdf: document.getElementById('export-pdf-btn'),
  exportDocx: document.getElementById('export-docx-btn'),
  exportStatus: document.getElementById('export-status'),
  settingsLintEnabled: document.getElementById('settings-lint-enabled'),
  settingsLintOnSave: document.getElementById('settings-lint-on-save'),
  settingsLintNoBlankList: document.getElementById('settings-lint-no-blank-list'),
  settingsLintTrimTrailing: document.getElementById('settings-lint-trim-trailing'),
  settingsLintHeadingLevels: document.getElementById('settings-lint-heading-levels'),
  settingsMermaidTheme: document.getElementById('settings-mermaid-theme'),
  settingsMermaidFontSize: document.getElementById('settings-mermaid-font-size'),
  settingsMermaidFontFamily: document.getElementById('settings-mermaid-font-family'),
  settingsMermaidFontFamilyCustom: document.getElementById('settings-mermaid-font-family-custom'),
  dayActivityDate: document.getElementById('day-activity-date'),
  dayActivityIncludeDaily: document.getElementById('day-activity-include-daily'),
  dayActivitySelectAll: document.getElementById('day-activity-select-all'),
  dayActivityClear: document.getElementById('day-activity-clear'),
  dayActivityOpen: document.getElementById('day-activity-open'),
  dayActivityList: document.getElementById('day-activity-list'),
  dayActivityModal: document.getElementById('day-activity-modal'),
  dayActivityModalClose: document.getElementById('day-activity-modal-close'),
  dayActivityModalList: document.getElementById('day-activity-modal-list'),
  dayActivityModalPreview: document.getElementById('day-activity-modal-preview'),
  recentChanges: document.getElementById('recent-changes'),
  recentSort: document.getElementById('recent-sort')
};

function setMessage(msg, tone = 'muted') {
  if (!els.message) return;
  els.message.textContent = msg || '';
  if (tone === 'error') {
    els.message.style.color = '#c0392b';
  } else if (tone === 'success') {
    els.message.style.color = '#1d9d65';
  } else {
    els.message.style.color = '';
  }
}

function setExportStatus(msg, tone = 'muted') {
  if (!els.exportStatus) return;
  els.exportStatus.textContent = msg || '';
  if (tone === 'error') {
    els.exportStatus.style.color = '#c0392b';
  } else if (tone === 'success') {
    els.exportStatus.style.color = '#1d9d65';
  } else {
    els.exportStatus.style.color = '';
  }
}

async function apiGet(pathname) {
  const res = await fetch(pathname, { credentials: 'include' });
  if (!res.ok) {
    const err = new Error(`${pathname} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function apiPost(pathname, payload) {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || `${pathname} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function parseApiError(err, fallback) {
  const msg = err?.message || '';
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error === 'create_failed' && parsed?.message?.includes('EEXIST')) {
      return 'File already exists';
    }
    if (parsed?.message) return parsed.message;
  } catch {
    // ignore
  }
  if (msg.includes('EEXIST')) return 'File already exists';
  return fallback || 'Request failed';
}

function toggleView(authenticated) {
  els.loginView.classList.toggle('hidden', authenticated);
  els.mainView.classList.toggle('hidden', !authenticated);
}

function applySplit() {
  const ratio = Math.min(Math.max(state.splitRatio, 0.2), 0.8);
  const editorPercent = ratio * 100;
  const previewPercent = (1 - ratio) * 100;
  document.documentElement.style.setProperty('--pane-editor', `${editorPercent}fr`);
  document.documentElement.style.setProperty('--pane-preview', `${previewPercent}fr`);
}

function setCurrentPathDisplay(path) {
  state.currentPath = path || null;
  const hasPath = !!path;
  els.currentPathInput.disabled = !hasPath;
  els.currentPathInput.value = hasPath ? path : '';
  els.currentPathInput.placeholder = hasPath ? '' : 'No file loaded';
  if (els.exportBtn) els.exportBtn.disabled = !hasPath || state.exporting;
}

function pushHistory(path) {
  if (!path) return;
  if (state.navigating) return;
  const trimmed = path.trim();
  if (state.history[state.historyIndex] === trimmed) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(trimmed);
  state.historyIndex = state.history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  els.backBtn.disabled = state.historyIndex <= 0;
  els.forwardBtn.disabled = state.historyIndex >= state.history.length - 1;
}

async function goHistory(offset) {
  const nextIndex = state.historyIndex + offset;
  if (nextIndex < 0 || nextIndex >= state.history.length) return;
  const target = state.history[nextIndex];
  state.historyIndex = nextIndex;
  state.navigating = true;
  await openFile(target, { skipHistory: true });
  state.navigating = false;
  updateHistoryButtons();
}

async function checkSession() {
  try {
    const data = await apiGet('/api/session');
    toggleView(!!data.authenticated);
    if (data.authenticated) {
      await afterLogin();
    }
  } catch {
    toggleView(false);
  }
}

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.textContent = '';
  try {
    await apiPost('/api/login', {
      username: els.username.value.trim(),
      password: els.password.value
    });
    toggleView(true);
    await afterLogin();
  } catch (err) {
    els.loginError.textContent = 'Invalid credentials';
    console.error(err);
  }
});

async function afterLogin() {
  setCurrentPathDisplay(null);
  await loadSettings();
  await Promise.all([loadTreeRoot(), loadCalendarDates()]);
  await loadRecentChanges();
  setMessage('Ready');
  updateHistoryButtons();
  applySplit();
  if (els.hoverPreviewContent && !state.hoverBound) {
    els.hoverPreviewContent.addEventListener('click', (e) => {
      const target = e.target.closest('.hover-link');
      if (!target) return;
      const path = target.getAttribute('data-open-path');
      if (!path) return;
      e.preventDefault();
      openFile(path);
      hideHoverPreview();
    });
    state.hoverBound = true;
  }
}

function setUnsaved(flag) {
  state.unsaved = flag;
  if (flag) {
    els.unsaved.textContent = 'Unsaved';
    els.unsaved.classList.add('dirty');
    window.onbeforeunload = () => true;
  } else {
    els.unsaved.textContent = 'Saved';
    els.unsaved.classList.remove('dirty');
    window.onbeforeunload = null;
  }
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

function resolveResourceHref(href, baseDir) {
  if (!href) return '';
  if (/^(https?:|mailto:|data:|tel:)/i.test(href)) return href;
  const clean = href.replace(/^\.\//, '').replace(/^\//, '');
  const prefix = baseDir ? `${baseDir}/` : '';
  return `/vault/${encodeURI(`${prefix}${clean}`)}`;
}

function preprocessWiki(text, baseDir, opts = {}) {
  const allowEmbeds = opts.allowEmbeds !== false;
  let out = text;
  if (allowEmbeds) {
    out = out.replace(/!\[\[([^\]]+)\]\]/g, (_m, p1) => {
      const raw = p1.trim();
      return `<div class="embed-block" data-embed-target="${escapeAttr(raw)}"><div class="embed-meta">Embedded: ${escapeHtml(
        raw
      )}</div><div class="embed-content">Loading...</div></div>`;
    });
  } else {
    out = out.replace(/!\[\[([^\]]+)\]\]/g, (_m, p1) => {
      const raw = p1.trim();
      return `[${escapeHtml(raw)}](vault-wiki://${encodeURIComponent(raw)})`;
    });
  }
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, p1) => {
    const [target, label] = p1.split('|');
    const rawTarget = target.trim();
    const display = (label || target).trim();
    return `[${escapeHtml(display)}](vault-wiki://${encodeURIComponent(rawTarget)})`;
  });
  return out;
}

function stripFrontmatter(text = '') {
  if (!text.startsWith('---')) return text;
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return text;
  const end = match[0].length;
  return text.slice(end);
}

function isImagePath(p = '') {
  const lower = p.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg)$/.test(lower);
}

function encodePathForUrl(p = '') {
  return p
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildDailyPathClient(dateStr) {
  const settings = state.settings || {};
  const tmpl = settings.dailyNotesTemplate || 'Daily/YYYY-MM-DD DAILY.md';
  const dir = settings.dailyNotesDir || '';
  const applied = tmpl.replace(/YYYY-MM-DD/g, dateStr);
  let rel = applied;
  if (!applied.includes('/') && dir) {
    rel = `${dir}/${applied}`;
  }
  return rel.replace(/^\/+/, '');
}

function getISOWeekInfo(dateInput) {
  const d = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function buildWeeklyPath(year, week) {
  const settings = state.settings || {};
  const tmpl = settings.weeklyNotesTemplate || 'Weekly notes/YYYY-{W}WW.md';
  const dir = settings.weeklyNotesDir || '';
  const wk = String(week).padStart(2, '0');
  const applied = tmpl
    .replace(/\{W\}/g, 'W')
    .replace(/YYYY/g, String(year))
    .replace(/WWW/g, `W${wk}`)
    .replace(/WW/g, wk);
  let rel = applied;
  if (!applied.includes('/') && dir) {
    rel = `${dir}/${applied}`;
  }
  return rel.replace(/^\/+/, '');
}

function createRenderer(baseDir, opts = {}) {
  const notePath = opts.notePath || '';
  let mermaidIndex = 0;
  const renderer = new marked.Renderer();
  renderer.link = (href, title, text) => {
    if ((href || '').startsWith('vault-wiki://')) {
      const decoded = decodeURIComponent(href.replace('vault-wiki://', ''));
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="#" data-wiki="${escapeAttr(decoded)}"${t} class="wiki-link">${text}</a>`;
    }
    const url = resolveResourceHref(href, baseDir);
    const isExternal = /^(https?:|mailto:|tel:)/i.test(href);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    const target = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${url}"${t}${target}>${text}</a>`;
  };
  renderer.image = (href, title, text) => {
    const url = resolveResourceHref(href, baseDir);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${url}" alt="${escapeHtml(text || '')}"${t}>`;
  };
  renderer.code = (code, lang) => {
    if ((lang || '').toLowerCase() === 'mermaid') {
      const idx = mermaidIndex++;
      const noteAttr = notePath ? ` data-note-path="${escapeAttr(notePath)}"` : '';
      return `
        <div class="mermaid-block" data-mermaid-index="${idx}"${noteAttr}>
          <div class="mermaid">${escapeHtml(code)}</div>
          <div class="mermaid-actions">
            <button type="button" class="mermaid-action" data-format="png">Save diagram as PNG</button>
            <button type="button" class="mermaid-action" data-format="svg">Save diagram as SVG</button>
          </div>
        </div>
      `;
    }
    const highlighted = highlightCode(code, lang);
    const langClass = lang ? `language-${escapeAttr(lang)}` : '';
    return `<pre><code class="hljs ${langClass}">${highlighted}</code></pre>`;
  };
  return renderer;
}

function highlightCode(code, lang) {
  if (window.hljs) {
    try {
      const norm = (lang || '').trim().toLowerCase();
      if (norm && hljs.getLanguage(norm)) {
        return hljs.highlight(code, { language: norm, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code, [
        'python',
        'javascript',
        'typescript',
        'bash',
        'shell',
        'json',
        'yaml',
        'html',
        'css',
        'markdown'
      ]).value;
    } catch (err) {
      console.error('Highlight failed', err);
    }
  }
  return escapeHtml(code);
}

function isListItemLine(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function lintMarkdown(text, options = {}) {
  const lines = (text || '').split('\n');
  const issues = [];
  if (options.maxBlankLines) {
    let blankRun = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() === '') {
        blankRun += 1;
        if (blankRun > 1) {
          lines.splice(i, 1);
          issues.push({ line: i + 1, rule: 'max-blank-lines' });
          i -= 1;
        }
      } else {
        blankRun = 0;
      }
    }
  }
  if (options.trimTrailing) {
    lines.forEach((line, idx) => {
      const trimmed = line.replace(/\s+$/g, '');
      if (trimmed !== line) {
        lines[idx] = trimmed;
        issues.push({ line: idx + 1, rule: 'trim-trailing' });
      }
    });
  }
  if (options.noBlankList) {
    let i = 1;
    while (i < lines.length - 1) {
      const isBlank = lines[i].trim() === '';
      if (isBlank && isListItemLine(lines[i - 1]) && isListItemLine(lines[i + 1])) {
        lines.splice(i, 1);
        issues.push({ line: i + 1, rule: 'no-blank-list' });
        continue;
      }
      i += 1;
    }
  }
  if (options.headingLevels) {
    let lastLevel = 0;
    lines.forEach((line, idx) => {
      const match = /^(#{1,6})\s+/.exec(line);
      if (!match) return;
      const level = match[1].length;
      if (lastLevel > 0 && level > lastLevel + 1) {
        const nextLevel = lastLevel + 1;
        lines[idx] = `${'#'.repeat(nextLevel)} ${line.slice(match[0].length)}`;
        issues.push({ line: idx + 1, rule: 'heading-levels' });
        lastLevel = nextLevel;
        return;
      }
      lastLevel = level;
    });
  }
  return { text: lines.join('\n'), issues };
}

function getLintOptions() {
  return {
    enabled: state.settings.lintEnabled !== false,
    onSave: state.settings.lintOnSave !== false,
    noBlankList: state.settings.lintNoBlankList !== false,
    maxBlankLines: true,
    trimTrailing: state.settings.lintTrimTrailing !== false,
    headingLevels: state.settings.lintHeadingLevels !== false
  };
}

function formatLintSummary(issues = []) {
  if (!issues.length) return '';
  const labels = {
    'trim-trailing': 'trim-trailing',
    'no-blank-list': 'no-blank-list',
    'heading-levels': 'heading-levels',
    'max-blank-lines': 'max-blank-lines'
  };
  const counts = issues.reduce((acc, issue) => {
    const key = labels[issue.rule] || issue.rule || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([rule, count]) => `${rule}:${count}`)
    .join(', ');
}

function runLint({ showMessage = true } = {}) {
  const options = getLintOptions();
  if (!options.enabled) {
    if (showMessage) setMessage('Linting is disabled in settings');
    return { applied: false, issues: [] };
  }
  const result = lintMarkdown(els.editor.value, options);
  const changed = result.text !== els.editor.value;
  if (changed) {
    els.editor.value = result.text;
    renderPreview(result.text, { force: true });
    setUnsaved(true);
  }
  if (showMessage) {
    if (!result.issues.length) {
      setMessage('No lint issues found', 'success');
    } else {
      const summary = formatLintSummary(result.issues);
      const details = summary ? ` (${summary})` : '';
      setMessage(`Applied ${result.issues.length} lint fix${result.issues.length === 1 ? '' : 'es'}${details}`, 'success');
    }
  }
  return { applied: changed, issues: result.issues };
}

function renderPreview(text, options = {}) {
  if (!options.force && text === state.lastRenderedPreview) return;
  const baseDir = state.currentPath ? state.currentPath.split('/').slice(0, -1).join('/') : '';
  const html = renderMarkdownToHtml(text || '', baseDir, true, state.currentPath);
  els.preview.innerHTML = html;
  if (window.hljs) {
    els.preview.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
  }
  rerenderMermaid(els.preview);
  bindMermaidActions(els.preview, state.currentPath);
  bindLightbox();
  bindWikiLinks();
  hydrateEmbeds();
  renderBacklinks(state.currentPath);
  state.lastRenderedPreview = text;
}

function schedulePreview(text) {
  if (previewTimer) {
    clearTimeout(previewTimer);
  }
  previewTimer = setTimeout(() => {
    renderPreview(text);
  }, 350);
}

function bindLightbox() {
  els.preview.querySelectorAll('img').forEach((img) => {
    img.onclick = () => {
      els.lightboxImg.src = img.src;
      els.lightbox.classList.remove('hidden');
    };
  });
  if (!state.lightboxBound) {
    els.lightbox.addEventListener('click', () => {
      els.lightbox.classList.add('hidden');
      els.lightboxImg.src = '';
    });
    state.lightboxBound = true;
  }
}

function bindWikiLinks() {
  els.preview.querySelectorAll('a[data-wiki]').forEach((a) => {
    a.onclick = async (e) => {
      e.preventDefault();
      const target = a.getAttribute('data-wiki');
      if (!target) return;
      const resolved = await resolveWikiTargetClient(target);
      if (!resolved) {
        setMessage(`Link not found: ${target}`, 'error');
        return;
      }
      if (isImagePath(resolved)) {
        const url = `/vault/${encodePathForUrl(resolved)}`;
        window.open(url, '_blank');
      } else {
        openFile(resolved);
      }
    };
  });
}

function bindMermaidActions(root, fallbackPath) {
  if (!root) return;
  root.querySelectorAll('.mermaid-action').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const format = btn.getAttribute('data-format');
      const block = btn.closest('.mermaid-block');
      const index = block ? Number(block.getAttribute('data-mermaid-index')) : NaN;
      const notePath = block?.getAttribute('data-note-path') || fallbackPath || state.currentPath;
      if (!notePath || Number.isNaN(index)) {
        setMessage('Mermaid export unavailable', 'error');
        return;
      }
      try {
        const theme = state.settings.theme || 'light';
        const mermaidTheme = state.settings.mermaidTheme || 'auto';
        const mermaidFontSize = state.settings.mermaidFontSize ?? '';
        const mermaidFontFamily = state.settings.mermaidFontFamily || 'auto';
        const mermaidFontFamilyCustom = state.settings.mermaidFontFamilyCustom || '';
        const url = `/api/export/mermaid-image?path=${encodeURIComponent(notePath)}&index=${index}&format=${encodeURIComponent(
          format
        )}&theme=${encodeURIComponent(theme)}&mermaidTheme=${encodeURIComponent(
          mermaidTheme
        )}&mermaidFontSize=${encodeURIComponent(mermaidFontSize)}&mermaidFontFamily=${encodeURIComponent(
          mermaidFontFamily
        )}&mermaidFontFamilyCustom=${encodeURIComponent(mermaidFontFamilyCustom)}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('download_failed');
        const blob = await res.blob();
        const filename = `${notePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'note'}-diagram-${index + 1}.${format}`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error(err);
        setMessage('Mermaid download failed', 'error');
      }
    });
  });
}

function renderMarkdownToHtml(text, baseDir, allowEmbeds, notePath) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: (code, lang) => highlightCode(code, lang)
  });
  const stripped = stripFrontmatter(text);
  const preprocessed = preprocessWiki(stripped, baseDir, { allowEmbeds });
  return marked.parse(preprocessed, { renderer: createRenderer(baseDir, { notePath }) });
}

async function resolveWikiTargetClient(target) {
  try {
    const data = await apiGet(`/api/resolve-wiki?target=${encodeURIComponent(target)}`);
    return data.path;
  } catch (err) {
    console.error('Resolve wiki failed', err);
    return null;
  }
}

async function hydrateEmbeds() {
  const blocks = els.preview.querySelectorAll('.embed-block[data-embed-target]');
  blocks.forEach(async (block) => {
    const rawTarget = block.getAttribute('data-embed-target');
    const contentEl = block.querySelector('.embed-content');
    if (!rawTarget || !contentEl) return;
    const resolved = await resolveWikiTargetClient(rawTarget);
    if (!resolved) {
      contentEl.innerHTML = `<div class="embed-meta" style="color:#c0392b;">Not found: ${escapeHtml(rawTarget)}</div>`;
      return;
    }
    try {
      if (isImagePath(resolved)) {
        const url = `/vault/${encodePathForUrl(resolved)}`;
        contentEl.innerHTML = `<img src="${url}" alt="${escapeHtml(rawTarget)}">`;
      } else {
        const data = await apiGet(`/api/file?path=${encodeURIComponent(resolved)}`);
        const embedBase = resolved.split('/').slice(0, -1).join('/');
        contentEl.innerHTML = renderMarkdownToHtml(data.content || '', embedBase, false, resolved);
        rerenderMermaid(contentEl);
        bindMermaidActions(contentEl, resolved);
        if (window.hljs) {
          contentEl.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
        }
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="embed-meta" style="color:#c0392b;">Failed to load: ${escapeHtml(target)}</div>`;
      console.error(err);
    }
  });
}

els.editor.addEventListener('input', () => {
  setUnsaved(true);
  schedulePreview(els.editor.value);
  handleImageSuggest();
});

async function loadDirectory(dir) {
  try {
    const data = await apiGet(`/api/list?dir=${encodeURIComponent(dir)}`);
    state.currentDir = dir || '';
    renderFileTreeNodes(data.items || [], els.fileTree, dir || '');
    els.breadcrumbs.textContent = dir ? `/${dir}` : '/';
    highlightActiveInTree();
  } catch (err) {
    setMessage('Could not load directory', 'error');
    console.error(err);
  }
}

async function loadTreeRoot() {
  await loadDirectory('');
}

function renderFileTreeNodes(items, container, currentDir) {
  container.innerHTML = '';
  const ul = document.createElement('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'tree-item';
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = item.type === 'dir' ? '▸' : '';
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = item.name;
    const actions = document.createElement('div');
    actions.className = 'tree-actions';
    if (item.type === 'file') {
      const moveBtn = document.createElement('button');
      moveBtn.textContent = 'Move';
      moveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveNode(item.path);
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Del';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNoteAt(item.path, item.type);
      });
      actions.appendChild(moveBtn);
      actions.appendChild(delBtn);
    }
    row.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(actions);
    if (item.path === state.currentPath) {
      row.classList.add('active');
      // Scroll into view if nested
      setTimeout(() => {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    }
    li.appendChild(row);
    if (item.type === 'dir') {
      const childContainer = document.createElement('ul');
      childContainer.style.display = 'none';
      li.appendChild(childContainer);
      toggle.style.cursor = 'pointer';
      toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const expanded = childContainer.dataset.loaded === 'true' && childContainer.style.display !== 'none';
        if (expanded) {
          childContainer.style.display = 'none';
          toggle.textContent = '▸';
        } else {
          toggle.textContent = '▾';
          if (childContainer.dataset.loaded !== 'true') {
            childContainer.innerHTML = '<li class="tree-item"><span class="tree-name">Loading...</span></li>';
            try {
              const data = await apiGet(`/api/list?dir=${encodeURIComponent(item.path)}`);
              renderFileTreeNodes(data.items || [], childContainer, item.path);
              childContainer.dataset.loaded = 'true';
            } catch (err) {
              childContainer.innerHTML = '<li class="tree-item"><span class="tree-name">Failed</span></li>';
              console.error(err);
            }
          } else {
            childContainer.style.display = 'block';
          }
          childContainer.style.display = 'block';
        }
      });
      name.addEventListener('click', () => toggle.click());
    } else {
      row.addEventListener('click', () => openFile(item.path));
    }
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

function highlightActiveInTree() {
  if (!els.fileTree) return;
  els.fileTree.querySelectorAll('.tree-item').forEach((row) => row.classList.remove('active'));
  if (!state.currentPath) return;
  const matches = Array.from(els.fileTree.querySelectorAll('.tree-item')).filter((row) => {
    const nameSpan = row.querySelector('.tree-name');
    return nameSpan && state.currentPath.endsWith(nameSpan.textContent);
  });
  if (matches.length) {
    const row = matches[0];
    row.classList.add('active');
    // Avoid scrolling the entire page; constrain to the file tree container.
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

async function openFile(path, options = {}) {
  if (!(await confirmIfDirty())) return;
  try {
    const data = await apiGet(`/api/file?path=${encodeURIComponent(path)}`);
    setCurrentPathDisplay(data.path);
    els.editor.value = data.content || '';
    renderPreview(data.content || '');
    setUnsaved(false);
    setMessage('Loaded', 'success');
    if (!options.skipHistory) pushHistory(data.path);
    updateHistoryButtons();
    highlightActiveInTree();
  } catch (err) {
    if (err?.status === 404) {
      try {
        const created = await apiPost('/api/file/create', { path });
        if (created && created.ok === false && created.reason === 'exists') {
          // Race: someone created it between read and create; retry load
          return openFile(path, { ...options, skipHistory: true });
        }
        await loadDirectory(state.currentDir);
        await loadCalendarDates();
        return openFile(path, { ...options, skipHistory: true });
      } catch (createErr) {
        setMessage('Failed to create missing file', 'error');
        console.error(createErr);
        return;
      }
    }
    setMessage('Failed to open file', 'error');
    console.error(err);
  }
}

async function confirmIfDirty() {
  if (!state.unsaved) return true;
  const ok = window.confirm('You have unsaved changes. Continue?');
  if (ok) setUnsaved(false);
  return ok;
}

async function saveFile() {
  if (!state.currentPath) {
    setMessage('No file selected', 'error');
    return;
  }
  try {
    const lintOptions = getLintOptions();
    if (lintOptions.enabled && lintOptions.onSave) {
      runLint({ showMessage: false });
    }
    await apiPost('/api/file/save', { path: state.currentPath, content: els.editor.value });
    setUnsaved(false);
    setMessage('Saved', 'success');
    await Promise.all([loadCalendarDates(), loadRecentChanges()]);
  } catch (err) {
    setMessage('Save failed', 'error');
    console.error(err);
  }
}

async function newNote() {
  const name = window.prompt('New note name (e.g. notes/today.md):');
  if (!name) return;
  const clean = name.endsWith('.md') ? name : `${name}.md`;
  try {
    const resp = await apiPost('/api/file/create', { path: clean });
    if (resp && resp.ok === false && resp.reason === 'exists') {
      setMessage('File already exists', 'error');
      return;
    }
    await loadDirectory(state.currentDir);
    await openFile(clean);
    await loadCalendarDates();
  } catch (err) {
    const friendly = parseApiError(err, 'Create failed');
    setMessage(friendly, 'error');
    if (friendly !== 'File already exists') {
      console.error(err);
    }
  }
}

async function renameNote() {
  if (!state.currentPath) {
    setMessage('No file selected', 'error');
    return;
  }
  const newName = window.prompt('New path/name:', state.currentPath);
  if (!newName) return;
  try {
    await apiPost('/api/file/rename', { oldPath: state.currentPath, newPath: newName });
    setCurrentPathDisplay(newName);
    await loadDirectory(state.currentDir);
    await loadCalendarDates();
    setMessage('Renamed', 'success');
  } catch (err) {
    setMessage('Rename failed', 'error');
    console.error(err);
  }
}

async function deleteNote() {
  if (!state.currentPath) {
    setMessage('No file selected', 'error');
    return;
  }
  const ok = window.confirm(`Delete ${state.currentPath}?`);
  if (!ok) return;
  try {
    await apiPost('/api/file/delete', { path: state.currentPath });
    els.editor.value = '';
    renderPreview('');
    setCurrentPathDisplay(null);
    setUnsaved(false);
    await loadDirectory(state.currentDir);
    await loadCalendarDates();
    setMessage('Deleted', 'success');
  } catch (err) {
    setMessage('Delete failed', 'error');
    console.error(err);
  }
}

function toggleExportMenu(open) {
  if (!els.exportMenu) return;
  const shouldOpen = typeof open === 'boolean' ? open : els.exportMenu.classList.contains('hidden');
  els.exportMenu.classList.toggle('hidden', !shouldOpen);
}

function closeExportMenu() {
  toggleExportMenu(false);
}

function extractDownloadName(res, fallback) {
  const header = res.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

async function exportNote(format) {
  if (!state.currentPath || state.exporting) return;
  state.exporting = true;
  if (els.exportBtn) els.exportBtn.disabled = true;
  setExportStatus(`Exporting ${format.toUpperCase()}...`);
  closeExportMenu();
  try {
    const theme = state.settings.theme || 'light';
    const mermaidTheme = state.settings.mermaidTheme || 'auto';
    const mermaidFontSize = state.settings.mermaidFontSize ?? '';
    const mermaidFontFamily = state.settings.mermaidFontFamily || 'auto';
    const mermaidFontFamilyCustom = state.settings.mermaidFontFamilyCustom || '';
    const url = `/api/export/${format}?path=${encodeURIComponent(state.currentPath)}&theme=${encodeURIComponent(
      theme
    )}&mermaidTheme=${encodeURIComponent(mermaidTheme)}&mermaidFontSize=${encodeURIComponent(
      mermaidFontSize
    )}&mermaidFontFamily=${encodeURIComponent(mermaidFontFamily)}&mermaidFontFamilyCustom=${encodeURIComponent(
      mermaidFontFamilyCustom
    )}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('export_failed');
    }
    const blob = await res.blob();
    const fallbackName = `${state.currentPath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'note'}.${format}`;
    const filename = extractDownloadName(res, fallbackName);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setExportStatus(`${format.toUpperCase()} exported`, 'success');
    setTimeout(() => setExportStatus(''), 2000);
  } catch (err) {
    console.error(err);
    setExportStatus(`${format.toUpperCase()} export failed`, 'error');
  } finally {
    state.exporting = false;
    if (els.exportBtn) els.exportBtn.disabled = !state.currentPath;
  }
}

els.saveBtn.addEventListener('click', saveFile);
els.newBtn.addEventListener('click', newNote);
els.renameBtn.addEventListener('click', renameNote);
els.deleteBtn.addEventListener('click', deleteNote);
els.logoutBtn.addEventListener('click', async () => {
  try {
    await apiPost('/api/logout');
  } finally {
    toggleView(false);
  }
});
els.backBtn.addEventListener('click', () => goHistory(-1));
els.forwardBtn.addEventListener('click', () => goHistory(1));
els.toggleSidebarBtn.addEventListener('click', () => {
  toggleSidebar();
});
if (els.lintBtn) {
  els.lintBtn.addEventListener('click', () => runLint());
}
if (els.exportBtn) {
  els.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.exportBtn.disabled) return;
    toggleExportMenu();
  });
}
if (els.exportPdf) {
  els.exportPdf.addEventListener('click', (e) => {
    e.stopPropagation();
    exportNote('pdf');
  });
}
if (els.exportDocx) {
  els.exportDocx.addEventListener('click', (e) => {
    e.stopPropagation();
    exportNote('docx');
  });
}
document.addEventListener('click', (e) => {
  if (!els.exportMenu || !els.exportBtn) return;
  if (!els.exportMenu.contains(e.target) && !els.exportBtn.contains(e.target)) {
    closeExportMenu();
  }
});
if (els.readmeBtn) els.readmeBtn.addEventListener('click', showProjectReadme);
if (els.readmeClose) els.readmeClose.addEventListener('click', () => toggleReadme(false));
if (els.readmeModal) {
  els.readmeModal.addEventListener('click', (e) => {
    if (e.target === els.readmeModal) toggleReadme(false);
  });
}
if (els.recentSort) {
  els.recentSort.addEventListener('change', renderRecentChanges);
}

let isResizing = false;
let previewTimer = null;
let hoverTimer = null;

function handlePointerMove(e) {
  if (!isResizing) return;
  const rect = els.panes.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const ratio = offsetX / rect.width;
  state.splitRatio = Math.min(Math.max(ratio, 0.2), 0.8);
  applySplit();
}

function stopResizing() {
  isResizing = false;
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', stopResizing);
}

if (els.resizer) {
  els.resizer.addEventListener('pointerdown', (e) => {
    isResizing = true;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    e.preventDefault();
  });
}

function handleSidebarPointerMove(e) {
  // no-op (sidebar drag disabled)
}

if (els.refreshBtn) {
  els.refreshBtn.addEventListener('click', () => loadDirectory(state.currentDir));
}

if (els.searchForm) {
  els.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = els.searchInput.value.trim();
    if (!term) return;
    els.searchStatus.textContent = 'Searching...';
    try {
      const data = await apiGet(`/api/search?q=${encodeURIComponent(term)}`);
      renderSearchResults(data.results || []);
      els.searchStatus.textContent = `${data.results.length} matches`;
    } catch (err) {
      els.searchStatus.textContent = 'Search failed';
      console.error(err);
    }
  });
}

function renderSearchResults(results) {
  els.searchResults.innerHTML = '';
  results.forEach((res) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(res.path)}</span><span class="meta">${escapeHtml(res.snippet || '')}</span>`;
    li.addEventListener('click', () => openFile(res.path));
    els.searchResults.appendChild(li);
  });
}

async function loadCalendarDates() {
  try {
    const data = await apiGet('/api/calendar/dates');
    state.calendarDates = new Set(data.dates || []);
    await ensureFilesLoaded({ refresh: true });
    const weekKeys = new Set();
    (state.files || []).forEach((f) => {
      if (!f?.path) return;
      const m = f.path.match(/(\d{4}-W\d{2})\.md$/i);
      if (m) weekKeys.add(m[1]);
    });
    state.calendarWeeks = weekKeys;
    await loadCalendarChanges(state.calendarMonth);
    await loadRecentChanges();
    renderCalendar();
  } catch (err) {
    console.error(err);
  }
}

async function loadCalendarChanges(monthDate) {
  const d = monthDate instanceof Date ? monthDate : new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  try {
    const data = await apiGet(`/api/calendar/changes?month=${encodeURIComponent(key)}`);
    state.calendarChanges = data.changes || {};
  } catch (err) {
    state.calendarChanges = {};
    console.error('Calendar changes failed', err);
  }
}

function buildMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseChangeEntries(changes) {
  const entries = [];
  Object.entries(changes || {}).forEach(([dateStr, paths]) => {
    (paths || []).forEach((path) => {
      entries.push({ date: dateStr, path });
    });
  });
  return entries;
}

async function loadRecentChanges() {
  if (!els.recentChanges) return;
  const now = new Date();
  const currentKey = buildMonthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = buildMonthKey(prevDate);
  try {
    const [current, previous] = await Promise.all([
      apiGet(`/api/calendar/changes?month=${encodeURIComponent(currentKey)}`),
      apiGet(`/api/calendar/changes?month=${encodeURIComponent(prevKey)}`)
    ]);
    const entries = [...parseChangeEntries(current.changes), ...parseChangeEntries(previous.changes)];
    state.recentChanges = entries;
    renderRecentChanges();
  } catch (err) {
    console.error('Recent changes failed', err);
    state.recentChanges = [];
    renderRecentChanges();
  }
}

function renderRecentChanges() {
  if (!els.recentChanges) return;
  const sortMode = els.recentSort?.value || 'newest';
  const entries = [...(state.recentChanges || [])];
  const compareDate = (a, b) => a.date.localeCompare(b.date);
  if (sortMode === 'oldest') {
    entries.sort((a, b) => compareDate(a, b) || a.path.localeCompare(b.path));
  } else if (sortMode === 'title') {
    entries.sort((a, b) => a.path.localeCompare(b.path) || compareDate(a, b));
  } else {
    entries.sort((a, b) => compareDate(b, a) || a.path.localeCompare(b.path));
  }
  const maxItems = 80;
  els.recentChanges.innerHTML = '';
  entries.slice(0, maxItems).forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="recent-link" data-open-path="${escapeAttr(item.path)}">
        <span class="recent-title">${escapeHtml(item.path)}</span>
        <span class="recent-meta">${escapeHtml(item.date)}</span>
      </button>
    `;
    li.querySelector('button')?.addEventListener('click', () => openFile(item.path));
    els.recentChanges.appendChild(li);
  });
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'status';
    li.textContent = 'No recent changes';
    els.recentChanges.appendChild(li);
  }
}

function formatActivityMeta(item) {
  const labels = [];
  if (item.created) labels.push('created');
  if (item.modified) labels.push('modified');
  if (!labels.length) labels.push('changed');
  return labels.join(', ');
}

function renderDayActivity() {
  if (!els.dayActivityList || !els.dayActivityDate) return;
  const { date, files, selected, includeDaily } = state.dayActivity || {};
  els.dayActivityDate.textContent = date || 'No day selected';
  if (els.dayActivityIncludeDaily) {
    els.dayActivityIncludeDaily.checked = !!includeDaily;
  }
  els.dayActivityList.innerHTML = '';
  if (!date) {
    const li = document.createElement('li');
    li.className = 'status';
    li.textContent = 'Select a day to see changes';
    els.dayActivityList.appendChild(li);
    return;
  }
  if (!files || !files.length) {
    const li = document.createElement('li');
    li.className = 'status';
    li.textContent = 'No modified files';
    els.dayActivityList.appendChild(li);
    return;
  }
  files.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'day-activity-item';
    const checked = selected && selected.has(item.path);
    li.innerHTML = `
      <label>
        <input type="checkbox" ${checked ? 'checked' : ''} data-activity-path="${escapeAttr(item.path)}">
        <span class="day-activity-title">${escapeHtml(item.path)}</span>
      </label>
      <span class="day-activity-meta">${escapeHtml(formatActivityMeta(item))}</span>
      <button type="button" class="day-activity-open-one" data-open-path="${escapeAttr(item.path)}">Open</button>
    `;
    li.querySelector('input[type="checkbox"]')?.addEventListener('change', (e) => {
      const path = e.target.getAttribute('data-activity-path');
      if (!path) return;
      if (!state.dayActivity.selected) state.dayActivity.selected = new Set();
      if (e.target.checked) {
        state.dayActivity.selected.add(path);
      } else {
        state.dayActivity.selected.delete(path);
      }
    });
    li.querySelector('.day-activity-open-one')?.addEventListener('click', () => openFile(item.path));
    els.dayActivityList.appendChild(li);
  });
}

async function loadDayActivity(dateStr) {
  if (!els.dayActivityList) return;
  try {
    const includeDaily = !!state.dayActivity.includeDaily;
    const data = await apiGet(
      `/api/calendar/day-files?date=${encodeURIComponent(dateStr)}&includeDaily=${includeDaily ? 'true' : 'false'}`
    );
    const nextSelected = new Set();
    if (state.dayActivity.date === dateStr && state.dayActivity.selected) {
      state.dayActivity.selected.forEach((path) => nextSelected.add(path));
    }
    state.dayActivity = {
      date: data.date || dateStr,
      files: data.files || [],
      selected: nextSelected,
      includeDaily
    };
    renderDayActivity();
  } catch (err) {
    console.error('Day activity failed', err);
    state.dayActivity = { date: dateStr, files: [], selected: new Set(), includeDaily: state.dayActivity.includeDaily };
    renderDayActivity();
  }
}

function toggleDayActivityModal(open) {
  if (!els.dayActivityModal) return;
  const shouldOpen = typeof open === 'boolean' ? open : els.dayActivityModal.classList.contains('hidden');
  els.dayActivityModal.classList.toggle('hidden', !shouldOpen);
}

function renderDayActivityModalList(paths, activePath) {
  if (!els.dayActivityModalList) return;
  els.dayActivityModalList.innerHTML = '';
  if (!paths.length) {
    const li = document.createElement('li');
    li.className = 'status';
    li.textContent = 'No files selected';
    els.dayActivityModalList.appendChild(li);
    return;
  }
  paths.forEach((path) => {
    const li = document.createElement('li');
    li.className = `day-activity-modal-item${path === activePath ? ' active' : ''}`;
    li.innerHTML = `
      <button type="button" class="day-activity-modal-link" data-preview-path="${escapeAttr(path)}">
        ${escapeHtml(path)}
      </button>
      <button type="button" class="day-activity-open-one" data-open-path="${escapeAttr(path)}">Open</button>
    `;
    li.querySelector('.day-activity-modal-link')?.addEventListener('click', () => {
      renderDayActivityPreview(path, paths);
    });
    li.querySelector('.day-activity-open-one')?.addEventListener('click', () => {
      openFile(path);
      toggleDayActivityModal(false);
    });
    els.dayActivityModalList.appendChild(li);
  });
}

async function renderDayActivityPreview(path, paths) {
  if (!els.dayActivityModalPreview) return;
  try {
    const data = await apiGet(`/api/file?path=${encodeURIComponent(path)}`);
    const baseDir = path.split('/').slice(0, -1).join('/');
    els.dayActivityModalPreview.innerHTML = renderMarkdownToHtml(data.content || '', baseDir, true, data.path);
    if (window.hljs) {
      els.dayActivityModalPreview.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    }
    rerenderMermaid(els.dayActivityModalPreview);
    bindMermaidActions(els.dayActivityModalPreview, path);
    bindWikiLinks();
    renderDayActivityModalList(paths, path);
  } catch (err) {
    els.dayActivityModalPreview.innerHTML = '<div class="status">Preview unavailable</div>';
    console.error('Day activity preview failed', err);
  }
}

async function renderBacklinks(currentPath) {
  if (!els.preview) return;
  const existing = els.preview.querySelector('.backlinks');
  if (existing) existing.remove();
  if (!currentPath) return;
  const container = document.createElement('div');
  container.className = 'backlinks';
  container.innerHTML = `
    <div class="backlinks-title">Linked from</div>
    <div class="backlinks-body">
      <div class="status">Loading backlinks...</div>
    </div>
  `;
  els.preview.appendChild(container);
  try {
    const data = await apiGet(`/api/backlinks?path=${encodeURIComponent(currentPath)}`);
    if (state.currentPath !== currentPath) return;
    const backlinks = data.backlinks || [];
    const body = container.querySelector('.backlinks-body');
    if (!body) return;
    if (!backlinks.length) {
      body.innerHTML = '<div class="status">No backlinks</div>';
      return;
    }
    const limit = 50;
    let expanded = false;
    const renderList = () => {
      const items = expanded ? backlinks : backlinks.slice(0, limit);
      const listHtml = items
        .map(
          (item) => `
            <li class="backlinks-item">
              <button type="button" class="backlinks-link" data-open-path="${escapeAttr(item.path)}">
                ${escapeHtml(item.path)}
              </button>
              ${item.snippet ? `<div class="backlinks-snippet">${escapeHtml(item.snippet)}</div>` : ''}
            </li>
          `
        )
        .join('');
      const moreBtn =
        backlinks.length > limit
          ? `<button type="button" class="backlinks-toggle">${expanded ? 'Show less' : `Show more (${backlinks.length - limit})`}</button>`
          : '';
      body.innerHTML = `
        <ul class="backlinks-list">${listHtml}</ul>
        ${moreBtn}
      `;
      body.querySelectorAll('.backlinks-link').forEach((btn) => {
        btn.addEventListener('click', () => openFile(btn.getAttribute('data-open-path')));
      });
      const toggle = body.querySelector('.backlinks-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          expanded = !expanded;
          renderList();
        });
      }
    };
    renderList();
  } catch (err) {
    if (state.currentPath !== currentPath) return;
    const body = container.querySelector('.backlinks-body');
    if (body) body.innerHTML = '<div class="status">Backlinks unavailable</div>';
    console.error('Backlinks failed', err);
  }
}

function showHoverPreview(html, evt) {
  if (!els.hoverPreview || !els.hoverPreviewContent) return;
  els.hoverPreviewContent.innerHTML = html;
  const pad = 18;
  const x = evt?.clientX || 20;
  const y = evt?.clientY || 20;
  const left = Math.min(window.innerWidth - 440, x + pad);
  const top = Math.min(window.innerHeight - 360, y + pad);
  els.hoverPreview.style.left = `${left}px`;
  els.hoverPreview.style.top = `${top}px`;
  els.hoverPreview.classList.remove('hidden');
}

function hideHoverPreview() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (els.hoverPreview) els.hoverPreview.classList.add('hidden');
}

function buildChangeListHtml(dateStr) {
  const changes = state.calendarChanges[dateStr] || [];
  if (!changes.length) return '';
  const items = changes
    .map((path) => `<li><button type="button" class="hover-link" data-open-path="${escapeAttr(path)}">${escapeHtml(path)}</button></li>`)
    .join('');
  return `
    <div class="change-list">
      <div class="change-title">Modified notes</div>
      <ul>${items}</ul>
    </div>
  `;
}

async function loadDayHoverPreview(dateStr, evt) {
  const path = buildDailyPathClient(dateStr);
  let snippet = '';
  try {
    const data = await apiGet(`/api/file?path=${encodeURIComponent(path)}`);
    const baseDir = path.split('/').slice(0, -1).join('/');
    snippet = renderMarkdownToHtml((data.content || '').slice(0, 1200), baseDir, false, data.path);
  } catch (err) {
    if (err.status !== 404) {
      console.error('Day hover preview failed', err);
    }
    snippet = '<div class="status">No daily note</div>';
  }
  const changesHtml = buildChangeListHtml(dateStr);
  showHoverPreview(`${snippet}${changesHtml}`, evt);
}

async function loadHoverPreview(path, evt) {
  try {
    const data = await apiGet(`/api/file?path=${encodeURIComponent(path)}`);
    const baseDir = path.split('/').slice(0, -1).join('/');
    const snippet = renderMarkdownToHtml((data.content || '').slice(0, 1200), baseDir, false, data.path);
    showHoverPreview(snippet, evt);
  } catch (err) {
    if (err.status === 404) {
      showHoverPreview('<div class="status">Not found</div>', evt);
      return;
    }
    showHoverPreview('<div class="status">Preview unavailable</div>', evt);
    console.error('Hover preview failed', err);
  }
}

function scheduleHoverPreview(path, evt) {
  if (!path) return;
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => loadHoverPreview(path, evt), 250);
}

function scheduleDayHoverPreview(dateStr, evt) {
  if (!dateStr) return;
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => loadDayHoverPreview(dateStr, evt), 250);
}

function renderCalendar() {
  hideHoverPreview();
  const monthDate = new Date(state.calendarMonth);
  monthDate.setDate(1);
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const weekStart = (state.settings.weekStartsOn || 'monday').toLowerCase();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = weekStart === 'monday' ? (firstDay + 6) % 7 : firstDay;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  els.calendarLabel.textContent = `${monthDate.toLocaleString('default', { month: 'long' })} ${year}`;
  els.calendarGrid.innerHTML = '';
  const dayNames = weekStart === 'monday' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headers = ['Wk', ...dayNames];
  headers.forEach((label, idx) => {
    const head = document.createElement('div');
    head.textContent = label;
    head.className = idx === 0 ? 'calendar-week calendar-head' : 'calendar-day calendar-head';
    els.calendarGrid.appendChild(head);
  });
  const totalCells = offset + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (let r = 0; r < rows; r++) {
    const rowStart = new Date(year, month, 1 - offset + r * 7);
    const { week, year: isoYear } = getISOWeekInfo(rowStart);
    const weekPath = buildWeeklyPath(isoYear, week);
    const weekKey = `${isoYear}-W${String(week).padStart(2, '0')}`;
    const weekCell = document.createElement('div');
    weekCell.className = 'calendar-week';
    const weekExists = state.filePathSet && state.filePathSet.has(weekPath.toLowerCase());
    const hasWeek = weekExists || state.calendarWeeks.has(weekKey);
    if (hasWeek) weekCell.classList.add('has-note');
    weekCell.innerHTML = `<span class="week-badge">${String(week)}</span>`;
    weekCell.title = `Open ${weekPath}`;
    weekCell.addEventListener('click', () => openWeek(isoYear, week));
    weekCell.addEventListener('mouseenter', (e) => scheduleHoverPreview(weekPath, e));
    weekCell.addEventListener('mouseleave', hideHoverPreview);
    els.calendarGrid.appendChild(weekCell);
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c;
      const dayNum = idx - offset + 1;
      const cell = document.createElement('div');
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        cell.textContent = dayNum;
        cell.className = 'calendar-day';
        if (state.calendarDates.has(dateStr)) cell.classList.add('has-note');
        if (state.calendarChanges[dateStr]?.length) cell.classList.add('has-changes');
        if (dateStr === todayStr) cell.classList.add('today');
        cell.addEventListener('click', () => openDay(dateStr));
        cell.addEventListener('mouseenter', (e) => {
          scheduleDayHoverPreview(dateStr, e);
        });
        cell.addEventListener('mouseleave', hideHoverPreview);
      } else {
        cell.className = 'calendar-day muted';
      }
      els.calendarGrid.appendChild(cell);
    }
  }
}

async function openDay(dateStr) {
  if (!(await confirmIfDirty())) return;
  try {
    const data = await apiPost('/api/day', { date: dateStr });
    await openFile(data.path);
    await loadCalendarDates();
    await loadDayActivity(dateStr);
  } catch (err) {
    setMessage('Could not open day note', 'error');
    console.error(err);
  }
}

async function openWeek(weekYear, weekNumber) {
  if (!(await confirmIfDirty())) return;
  const path = buildWeeklyPath(weekYear, weekNumber);
  try {
    await apiPost('/api/file/create', { path });
    await openFile(path);
    await loadCalendarDates();
  } catch (err) {
    const friendly = parseApiError(err, 'Could not open weekly note');
    setMessage(friendly, 'error');
    console.error(err);
  }
}

els.calendarPrev.addEventListener('click', async () => {
  const d = new Date(state.calendarMonth);
  d.setMonth(d.getMonth() - 1);
  state.calendarMonth = d;
  await loadCalendarChanges(state.calendarMonth);
  renderCalendar();
});

els.calendarNext.addEventListener('click', async () => {
  const d = new Date(state.calendarMonth);
  d.setMonth(d.getMonth() + 1);
  state.calendarMonth = d;
  await loadCalendarChanges(state.calendarMonth);
  renderCalendar();
});

if (els.calendarGrid) {
  els.calendarGrid.addEventListener('mouseleave', hideHoverPreview);
}

function normalizeShortcut(s) {
  return s
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+');
}

function matchShortcut(e, shortcut) {
  if (!shortcut) return false;
  if (!e || typeof e.key !== 'string') return false;
  const parts = (shortcut || '').toLowerCase().split('+').map((p) => p.trim());
  const needCtrl = parts.includes('ctrl') || parts.includes('control');
  const needAlt = parts.includes('alt');
  const needMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
  const keyPart = parts.find((p) => !['ctrl', 'control', 'alt', 'meta', 'cmd', 'command', 'shift'].includes(p));
  const needShift = parts.includes('shift');
  if (needCtrl && !(e.ctrlKey || e.metaKey)) return false;
  if (needAlt !== e.altKey) return false;
  if (needMeta !== e.metaKey) return false;
  if (needShift !== e.shiftKey) return false;
  if (!keyPart) return false;
  return e.key.toLowerCase() === keyPart.toLowerCase();
}

window.addEventListener('keydown', (e) => {
  if (!e.key) return;
  const saveShortcut = state.settings.shortcutSave || 'ctrl+s';
  const backShortcut = state.settings.shortcutBack || 'alt+arrowleft';
  const forwardShortcut = state.settings.shortcutForward || 'alt+arrowright';
  const lineUpShortcut = state.settings.shortcutLineUp || 'alt+arrowup';
  const lineDownShortcut = state.settings.shortcutLineDown || 'alt+arrowdown';
  const multiSelectShortcut = state.settings.shortcutMultiSelect || 'ctrl+d';
  const multiSelectAllShortcut = state.settings.shortcutMultiSelectAll || 'ctrl+shift+d';
  const toggleSidebarShortcut = state.settings.shortcutToggleSidebar || 'alt+s';

  // Always block the browser's save dialog on Ctrl/Cmd+S.
  if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
  }

  if (matchShortcut(e, saveShortcut)) {
    e.preventDefault();
    saveFile();
    return;
  }
  if (matchShortcut(e, backShortcut)) {
    e.preventDefault();
    goHistory(-1);
  } else if (matchShortcut(e, forwardShortcut)) {
    e.preventDefault();
    goHistory(1);
  } else if (matchShortcut(e, lineUpShortcut) && e.target === els.editor) {
    e.preventDefault();
    moveCurrentLine(-1);
  } else if (matchShortcut(e, lineDownShortcut) && e.target === els.editor) {
    e.preventDefault();
    moveCurrentLine(1);
  } else if (matchShortcut(e, multiSelectShortcut) && e.target === els.editor) {
    e.preventDefault();
    selectNextOccurrence();
  } else if (matchShortcut(e, multiSelectAllShortcut) && e.target === els.editor) {
    e.preventDefault();
    openReplacePanel();
  } else if (matchShortcut(e, toggleSidebarShortcut)) {
    e.preventDefault();
    toggleSidebar();
  } else if (state.suggest.active && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    handleImageSuggestNav(e.key);
  }
});

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme || 'light');
  const darkLink = document.getElementById('hljs-dark');
  const lightLink = document.getElementById('hljs-light');
  if (darkLink && lightLink) {
    const useDark = DARK_THEMES.has((theme || 'light').toLowerCase());
    darkLink.disabled = !useDark;
    lightLink.disabled = useDark;
  }
  updateMermaidTheme(
    theme,
    state.settings.mermaidTheme,
    state.settings.mermaidFontSize,
    state.settings.mermaidFontFamily,
    state.settings.mermaidFontFamilyCustom
  );
  try {
    localStorage.setItem('preferredTheme', theme || 'light');
  } catch {
    // ignore storage failures
  }
}

const storedTheme = (() => {
  try {
    return localStorage.getItem('preferredTheme');
  } catch {
    return null;
  }
})();
if (storedTheme) {
  applyTheme(storedTheme);
}

function moveCurrentLine(direction) {
  const textarea = els.editor;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lines = value.split('\n');
  const prefix = value.slice(0, start);
  const currentLine = prefix.split('\n').length - 1;
  if ((direction < 0 && currentLine === 0) || (direction > 0 && currentLine === lines.length - 1)) return;
  const targetLine = currentLine + direction;
  const temp = lines[currentLine];
  lines[currentLine] = lines[targetLine];
  lines[targetLine] = temp;
  const newValue = lines.join('\n');
  textarea.value = newValue;
  const lineLengths = lines.map((l) => l.length + 1);
  const startOffset = lineLengths.slice(0, currentLine).reduce((a, b) => a + b, 0);
  const targetOffset = lineLengths.slice(0, targetLine).reduce((a, b) => a + b, 0);
  const cursorColumn = start - startOffset;
  const newStart = targetOffset + Math.min(cursorColumn, lines[targetLine].length);
  const selectionLength = end - start;
  const newEnd = newStart + selectionLength;
  textarea.selectionStart = newStart;
  textarea.selectionEnd = newEnd;
  renderPreview(textarea.value);
  setUnsaved(true);
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  els.workspace.classList.toggle('collapsed', state.sidebarCollapsed);
  applySplit();
}

function applySidebarWidth(px) {
  const clamped = Math.max(200, Math.min(px, 600));
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
  state.sidebarCollapsed = false;
  els.workspace.classList.remove('collapsed');
  if (els.sidebarResizer) {
    els.sidebarResizer.classList.add('active');
    setTimeout(() => els.sidebarResizer.classList.remove('active'), 150);
  }
}

async function ensureImagesLoaded() {
  if (state.images.length) return;
  try {
    const data = await apiGet('/api/images');
    state.images = data.images || [];
  } catch (err) {
    console.error(err);
  }
}

async function ensureFilesLoaded(options = {}) {
  const refresh = options.refresh === true;
  if (state.files.length && !refresh) return;
  try {
    const data = await apiGet('/api/files-flat');
    state.files = data.files || [];
    state.filePathSet = new Set((state.files || []).map((f) => (f.path || '').toLowerCase()));
  } catch (err) {
    console.error(err);
  }
}

function hideImageSuggest() {
  state.suggest = { active: false, items: [], index: -1, query: '', mode: 'link', loading: false };
  if (els.imageSuggest) els.imageSuggest.classList.add('hidden');
}

function renderImageSuggest() {
  if (!els.imageSuggest || !els.imageSuggestList) return;
  els.imageSuggestList.innerHTML = '';
  if (state.suggest.loading) {
    const li = document.createElement('li');
    li.textContent = 'Loading...';
    els.imageSuggestList.appendChild(li);
  } else if (!state.suggest.items.length) {
    const li = document.createElement('li');
    li.textContent = 'No matches';
    els.imageSuggestList.appendChild(li);
  } else {
    state.suggest.items.forEach((item, idx) => {
      const li = document.createElement('li');
      li.textContent = item.path;
      if (idx === state.suggest.index) li.classList.add('active');
      li.addEventListener('click', () => insertImageSuggestion(item));
      els.imageSuggestList.appendChild(li);
    });
  }
  els.imageSuggest.classList.toggle('hidden', !state.suggest.active);
}

function insertImageSuggestion(item) {
  if (!item) return;
  const textarea = els.editor;
  const cursor = textarea.selectionStart;
  const text = textarea.value;
  const triggerPos = text.lastIndexOf(state.suggest.mode === 'image' ? '![[' : '[[', cursor);
  if (triggerPos === -1) return;
  const replacement = `${item.path}]]`;
  const before = text.slice(0, triggerPos + (state.suggest.mode === 'image' ? 3 : 2));
  const after = text.slice(cursor);
  const nextValue = before + replacement + after;
  textarea.value = nextValue;
  const newCursor = before.length + replacement.length;
  textarea.selectionStart = textarea.selectionEnd = newCursor;
  renderPreview(nextValue);
  setUnsaved(true);
  hideImageSuggest();
}

async function handleImageSuggest() {
  const textarea = els.editor;
  const cursor = textarea.selectionStart;
  const text = textarea.value;
  const triggerImage = text.lastIndexOf('![[', cursor);
  const triggerLink = text.lastIndexOf('[[', cursor);
  let triggerPos = -1;
  let mode = 'link';
  if (triggerImage !== -1 && triggerImage >= triggerLink) {
    triggerPos = triggerImage;
    mode = 'image';
  } else if (triggerLink !== -1) {
    triggerPos = triggerLink;
    mode = 'link';
  }
  if (triggerPos === -1) {
    hideImageSuggest();
    return;
  }
  const afterTrigger = text.slice(triggerPos, cursor);
  if (afterTrigger.includes(']]')) {
    hideImageSuggest();
    return;
  }
  const query = text.slice(triggerPos + (mode === 'image' ? 3 : 2), cursor).toLowerCase();
  state.suggest = { active: true, items: [], index: -1, query, mode, loading: true };
  renderImageSuggest();
  if (mode === 'image') {
    await ensureImagesLoaded();
    const pool = state.images;
    const filtered = (query ? pool.filter((img) => img.path.toLowerCase().includes(query)) : pool).slice(0, 20);
    state.suggest = { active: true, items: filtered, index: filtered.length ? 0 : -1, query, mode, loading: false };
  } else {
    await ensureFilesLoaded();
    const pool = state.files;
    const filtered = (query ? pool.filter((f) => f.path.toLowerCase().includes(query)) : pool).slice(0, 20);
    state.suggest = { active: true, items: filtered, index: filtered.length ? 0 : -1, query, mode, loading: false };
  }
  renderImageSuggest();
}

function selectNextOccurrence() {
  const textarea = els.editor;
  const value = textarea.value;
  let start = textarea.selectionStart;
  let end = textarea.selectionEnd;
  let needle = value.slice(start, end);
  if (!needle) {
    // select current word
    const left = value.slice(0, start);
    const right = value.slice(end);
    const leftWord = left.match(/[\w-]+$/);
    const rightWord = right.match(/^[\w-]+/);
    needle = `${leftWord ? leftWord[0] : ''}${rightWord ? rightWord[0] : ''}`;
    if (!needle) return;
    start = left.length - (leftWord ? leftWord[0].length : 0);
    end = start + needle.length;
  }
  const nextIndex = value.indexOf(needle, end);
  if (nextIndex === -1) return;
  textarea.focus();
  textarea.selectionStart = nextIndex;
  textarea.selectionEnd = nextIndex + needle.length;
}

function openReplacePanel() {
  if (!els.replacePanel) return;
  els.replacePanel.classList.remove('hidden');
  const textarea = els.editor;
  const value = textarea.value;
  let start = textarea.selectionStart;
  let end = textarea.selectionEnd;
  let seed = value.slice(start, end);
  if (!seed) {
    const left = value.slice(0, start);
    const right = value.slice(end);
    const leftWord = left.match(/[\w-]+$/);
    const rightWord = right.match(/^[\w-]+/);
    seed = `${leftWord ? leftWord[0] : ''}${rightWord ? rightWord[0] : ''}`;
  }
  els.replaceFind.value = seed || '';
  els.replaceWith.value = seed || '';
  updateReplaceCount();
  setTimeout(() => {
    if (els.replaceWith) els.replaceWith.focus();
  }, 0);
}

function closeReplacePanel() {
  if (els.replacePanel) els.replacePanel.classList.add('hidden');
}

function updateReplaceCount() {
  if (!els.replaceCount) return;
  const needle = els.replaceFind.value;
  if (!needle) {
    els.replaceCount.textContent = '';
    return;
  }
  const value = els.editor.value;
  const matches = value.split(needle).length - 1;
  els.replaceCount.textContent = matches > 0 ? `${matches} match${matches === 1 ? '' : 'es'}` : 'No matches';
}

function applyReplacePanel() {
  const textarea = els.editor;
  const value = textarea.value;
  const needle = els.replaceFind.value;
  if (!needle) return;
  const replacement = els.replaceWith.value;
  const replaced = value.split(needle).join(replacement);
  textarea.value = replaced;
  // place cursor at end of first replacement
  const idx = replaced.indexOf(replacement);
  const pos = idx === -1 ? 0 : idx + replacement.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  renderPreview(replaced);
  setUnsaved(true);
  updateReplaceCount();
  closeReplacePanel();
}

async function deleteNoteAt(path, type) {
  if (type === 'dir') {
    setMessage('Folder delete not supported', 'error');
    return;
  }
  const ok = window.confirm(`Delete ${path}?`);
  if (!ok) return;
  try {
    await apiPost('/api/file/delete', { path });
    await loadTreeRoot();
    await loadCalendarDates();
    if (state.currentPath === path) {
      els.editor.value = '';
      renderPreview('');
      setCurrentPathDisplay(null);
      setUnsaved(false);
    }
    setMessage('Deleted', 'success');
  } catch (err) {
    setMessage('Delete failed', 'error');
    console.error(err);
  }
}

async function moveNode(path) {
  const newPath = window.prompt('Move to path:', path);
  if (!newPath || newPath === path) return;
  try {
    await apiPost('/api/file/rename', { oldPath: path, newPath: newPath });
    await loadTreeRoot();
    await loadCalendarDates();
    if (state.currentPath === path) {
      setCurrentPathDisplay(newPath);
    }
    setMessage('Moved', 'success');
  } catch (err) {
    setMessage('Move failed', 'error');
    console.error(err);
  }
}

async function showProjectReadme() {
  try {
    const data = await apiGet('/api/project-readme');
    const html = renderMarkdownToHtml(data.content || '', '', true, '');
    els.readmeBody.innerHTML = html;
    if (window.hljs) {
      els.readmeBody.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    }
    toggleReadme(true);
  } catch (err) {
    setMessage('README not available', 'error');
    console.error(err);
  }
}

function toggleReadme(open) {
  els.readmeModal.classList.toggle('hidden', open === false);
}

function handleImageSuggestNav(key) {
  if (!state.suggest.items.length) {
    hideImageSuggest();
    return;
  }
  if (key === 'Escape') {
    hideImageSuggest();
    return;
  }
  if (key === 'ArrowDown') {
    state.suggest.index = Math.min(state.suggest.index + 1, state.suggest.items.length - 1);
  } else if (key === 'ArrowUp') {
    state.suggest.index = Math.max(state.suggest.index - 1, 0);
  } else if (key === 'Enter') {
    const selected = state.suggest.items[state.suggest.index];
    insertImageSuggestion(selected);
    return;
  }
  renderImageSuggest();
}

async function renameFromInput() {
  if (!state.currentPath) return;
  const desired = els.currentPathInput.value.trim();
  if (!desired || desired === state.currentPath) {
    setCurrentPathDisplay(state.currentPath);
    return;
  }
  try {
    await apiPost('/api/file/rename', { oldPath: state.currentPath, newPath: desired });
    setCurrentPathDisplay(desired);
    await loadDirectory(state.currentDir);
    await loadCalendarDates();
    setMessage('Renamed', 'success');
  } catch (err) {
    setMessage('Rename failed', 'error');
    console.error(err);
    setCurrentPathDisplay(state.currentPath);
  }
}

els.currentPathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    renameFromInput();
  } else if (e.key === 'Escape') {
    setCurrentPathDisplay(state.currentPath);
  }
});

els.currentPathInput.addEventListener('blur', () => {
  renameFromInput();
});

async function loadSettings() {
  try {
    const data = await apiGet('/api/settings');
    state.settings = data.settings || {};
    if (els.settingsDailyDir) els.settingsDailyDir.value = state.settings.dailyNotesDir || '';
    if (els.settingsDailyTemplate) els.settingsDailyTemplate.value = state.settings.dailyNotesTemplate || '';
    if (els.settingsWeeklyDir) els.settingsWeeklyDir.value = state.settings.weeklyNotesDir || '';
    if (els.settingsWeeklyTemplate) els.settingsWeeklyTemplate.value = state.settings.weeklyNotesTemplate || '';
    if (els.settingsWeekStart) els.settingsWeekStart.value = state.settings.weekStartsOn || 'monday';
    if (els.settingsSortOrder) els.settingsSortOrder.value = state.settings.fileSortOrder || 'mtime_desc';
    if (els.settingsShortcutSave) els.settingsShortcutSave.value = state.settings.shortcutSave || 'Ctrl+S';
    if (els.settingsShortcutBack) els.settingsShortcutBack.value = state.settings.shortcutBack || 'Alt+ArrowLeft';
    if (els.settingsShortcutForward) els.settingsShortcutForward.value = state.settings.shortcutForward || 'Alt+ArrowRight';
    if (els.settingsShortcutLineUp) els.settingsShortcutLineUp.value = state.settings.shortcutLineUp || 'Alt+ArrowUp';
    if (els.settingsShortcutLineDown) els.settingsShortcutLineDown.value = state.settings.shortcutLineDown || 'Alt+ArrowDown';
    if (els.settingsShortcutMultiSelect) els.settingsShortcutMultiSelect.value = state.settings.shortcutMultiSelect || 'Ctrl+D';
    if (els.settingsShortcutMultiSelectAll) els.settingsShortcutMultiSelectAll.value = state.settings.shortcutMultiSelectAll || 'Ctrl+Shift+D';
    if (els.settingsShortcutToggle) els.settingsShortcutToggle.value = state.settings.shortcutToggleSidebar || 'Alt+S';
    if (els.settingsTheme) els.settingsTheme.value = state.settings.theme || 'light';
    if (els.settingsMermaidTheme) {
      const mermaidTheme = MERMAID_THEMES.has((state.settings.mermaidTheme || '').toLowerCase())
        ? state.settings.mermaidTheme
        : 'auto';
      els.settingsMermaidTheme.value = mermaidTheme;
    }
    if (els.settingsMermaidFontSize) {
      const size = Number(state.settings.mermaidFontSize);
      els.settingsMermaidFontSize.value = Number.isFinite(size) ? String(size) : '';
    }
    if (els.settingsMermaidFontFamily) {
      const family = (state.settings.mermaidFontFamily || '').toLowerCase();
      const resolved = ['auto', 'sans', 'serif', 'mono', 'custom'].includes(family) ? family : 'auto';
      els.settingsMermaidFontFamily.value = resolved;
    }
    if (els.settingsMermaidFontFamilyCustom) {
      els.settingsMermaidFontFamilyCustom.value = state.settings.mermaidFontFamilyCustom || '';
    }
    if (els.settingsMermaidFontFamilyCustom && els.settingsMermaidFontFamily) {
      els.settingsMermaidFontFamilyCustom.disabled = els.settingsMermaidFontFamily.value !== 'custom';
    }
    if (els.settingsNoteTemplate) els.settingsNoteTemplate.value = state.settings.noteTemplate || '';
    if (els.settingsSearchLimit) els.settingsSearchLimit.value = state.settings.searchLimit || 1000;
    if (els.settingsLintEnabled) els.settingsLintEnabled.checked = state.settings.lintEnabled !== false;
    if (els.settingsLintOnSave) els.settingsLintOnSave.checked = state.settings.lintOnSave !== false;
    if (els.settingsLintNoBlankList) els.settingsLintNoBlankList.checked = state.settings.lintNoBlankList !== false;
    if (els.settingsLintTrimTrailing) els.settingsLintTrimTrailing.checked = state.settings.lintTrimTrailing !== false;
    if (els.settingsLintHeadingLevels) els.settingsLintHeadingLevels.checked = state.settings.lintHeadingLevels !== false;
    applyTheme(state.settings.theme || 'light');
    if (els.settingsStatus) els.settingsStatus.textContent = '';
  } catch (err) {
    setMessage('Could not load settings', 'error');
    console.error(err);
  }
}

async function saveSettings() {
  try {
    const payload = {
      dailyNotesDir: els.settingsDailyDir.value,
      dailyNotesTemplate: els.settingsDailyTemplate.value,
      weeklyNotesDir: els.settingsWeeklyDir.value,
      weeklyNotesTemplate: els.settingsWeeklyTemplate.value,
      weekStartsOn: els.settingsWeekStart.value,
      fileSortOrder: els.settingsSortOrder.value,
      shortcutSave: els.settingsShortcutSave.value,
      shortcutBack: els.settingsShortcutBack.value,
      shortcutForward: els.settingsShortcutForward.value,
      shortcutLineUp: els.settingsShortcutLineUp.value,
      shortcutLineDown: els.settingsShortcutLineDown.value,
      shortcutMultiSelect: els.settingsShortcutMultiSelect.value,
      shortcutMultiSelectAll: els.settingsShortcutMultiSelectAll.value,
      shortcutToggleSidebar: els.settingsShortcutToggle.value,
      theme: els.settingsTheme?.value || 'light',
      mermaidTheme: els.settingsMermaidTheme?.value || 'auto',
      mermaidFontSize: els.settingsMermaidFontSize?.value ? Number(els.settingsMermaidFontSize.value) : undefined,
      mermaidFontFamily: els.settingsMermaidFontFamily?.value || 'auto',
      mermaidFontFamilyCustom: els.settingsMermaidFontFamilyCustom?.value || '',
      noteTemplate: els.settingsNoteTemplate.value,
      searchLimit: Number(els.settingsSearchLimit.value) || undefined,
      lintEnabled: !!els.settingsLintEnabled?.checked,
      lintOnSave: !!els.settingsLintOnSave?.checked,
      lintNoBlankList: !!els.settingsLintNoBlankList?.checked,
      lintTrimTrailing: !!els.settingsLintTrimTrailing?.checked,
      lintHeadingLevels: !!els.settingsLintHeadingLevels?.checked
    };
    const data = await apiPost('/api/settings', payload);
    state.settings = data.settings || {};
    applyTheme(state.settings.theme || 'light');
    els.settingsStatus.textContent = 'Saved';
    setTimeout(() => (els.settingsStatus.textContent = ''), 2000);
    await loadDirectory(state.currentDir);
  } catch (err) {
    els.settingsStatus.textContent = 'Save failed';
    console.error(err);
  }
}

if (els.settingsSave) els.settingsSave.addEventListener('click', saveSettings);
if (els.settingsToggle && els.settingsBody) {
  els.settingsToggle.addEventListener('click', () => {
    const isHidden = els.settingsBody.classList.contains('hidden');
    els.settingsBody.classList.toggle('hidden', !isHidden);
    els.settingsToggle.textContent = isHidden ? 'Settings ▾' : 'Settings ▸';
  });
  els.settingsBody.classList.add('hidden');
}

if (els.settingsTheme) {
  els.settingsTheme.addEventListener('change', (e) => {
    const theme = e.target.value;
    state.settings = state.settings || {};
    state.settings.theme = theme;
    applyTheme(theme);
    renderPreview(els.editor.value, { force: true });
  });
}

if (els.settingsMermaidTheme) {
  els.settingsMermaidTheme.addEventListener('change', (e) => {
    const theme = e.target.value;
    state.settings = state.settings || {};
    state.settings.mermaidTheme = theme;
    updateMermaidTheme(
      state.settings.theme || 'light',
      theme,
      state.settings.mermaidFontSize,
      state.settings.mermaidFontFamily,
      state.settings.mermaidFontFamilyCustom
    );
    renderPreview(els.editor.value, { force: true });
  });
}

if (els.settingsMermaidFontSize) {
  els.settingsMermaidFontSize.addEventListener('change', (e) => {
    const size = e.target.value ? Number(e.target.value) : undefined;
    state.settings = state.settings || {};
    state.settings.mermaidFontSize = size;
    updateMermaidTheme(
      state.settings.theme || 'light',
      state.settings.mermaidTheme,
      state.settings.mermaidFontSize,
      state.settings.mermaidFontFamily,
      state.settings.mermaidFontFamilyCustom
    );
    renderPreview(els.editor.value, { force: true });
  });
}

if (els.settingsMermaidFontFamily) {
  els.settingsMermaidFontFamily.addEventListener('change', (e) => {
    const family = e.target.value;
    state.settings = state.settings || {};
    state.settings.mermaidFontFamily = family;
    if (els.settingsMermaidFontFamilyCustom) {
      els.settingsMermaidFontFamilyCustom.disabled = family !== 'custom';
    }
    updateMermaidTheme(
      state.settings.theme || 'light',
      state.settings.mermaidTheme,
      state.settings.mermaidFontSize,
      state.settings.mermaidFontFamily,
      state.settings.mermaidFontFamilyCustom
    );
    renderPreview(els.editor.value, { force: true });
  });
}

if (els.settingsMermaidFontFamilyCustom) {
  els.settingsMermaidFontFamilyCustom.addEventListener('change', (e) => {
    const custom = e.target.value;
    state.settings = state.settings || {};
    state.settings.mermaidFontFamilyCustom = custom;
    updateMermaidTheme(
      state.settings.theme || 'light',
      state.settings.mermaidTheme,
      state.settings.mermaidFontSize,
      state.settings.mermaidFontFamily,
      state.settings.mermaidFontFamilyCustom
    );
    renderPreview(els.editor.value, { force: true });
  });
}

if (els.replaceApply) {
  els.replaceApply.addEventListener('click', applyReplacePanel);
}
if (els.replaceCancel) {
  els.replaceCancel.addEventListener('click', closeReplacePanel);
}
if (els.replaceFind) {
  els.replaceFind.addEventListener('input', updateReplaceCount);
  els.replaceFind.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyReplacePanel();
    } else if (e.key === 'Escape') {
      closeReplacePanel();
    }
  });
}
if (els.replaceWith) {
  els.replaceWith.addEventListener('input', updateReplaceCount);
  els.replaceWith.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyReplacePanel();
    } else if (e.key === 'Escape') {
      closeReplacePanel();
    }
  });
}

if (els.dayActivityIncludeDaily) {
  els.dayActivityIncludeDaily.addEventListener('change', (e) => {
    state.dayActivity.includeDaily = !!e.target.checked;
    if (state.dayActivity.date) loadDayActivity(state.dayActivity.date);
    renderDayActivity();
  });
}

if (els.dayActivitySelectAll) {
  els.dayActivitySelectAll.addEventListener('click', () => {
    if (!state.dayActivity.files?.length) return;
    state.dayActivity.selected = new Set(state.dayActivity.files.map((item) => item.path));
    renderDayActivity();
  });
}

if (els.dayActivityClear) {
  els.dayActivityClear.addEventListener('click', () => {
    state.dayActivity.selected = new Set();
    renderDayActivity();
  });
}

if (els.dayActivityOpen) {
  els.dayActivityOpen.addEventListener('click', async () => {
    const selected = Array.from(state.dayActivity.selected || []);
    if (!selected.length) {
      setMessage('No files selected', 'error');
      return;
    }
    toggleDayActivityModal(true);
    renderDayActivityModalList(selected, selected[0]);
    renderDayActivityPreview(selected[0], selected);
  });
}

if (els.dayActivityModalClose) {
  els.dayActivityModalClose.addEventListener('click', () => toggleDayActivityModal(false));
}

if (els.dayActivityModal) {
  els.dayActivityModal.addEventListener('click', (e) => {
    if (e.target === els.dayActivityModal) toggleDayActivityModal(false);
  });
}

checkSession();
