# Obsidian-Style Web Viewer/Editor

Single-user web app to browse, view, and edit the Markdown knowledge base in `zett/` from a browser. No plugin system, no third-party contributor model—just a focused, self-hosted tool with simple login.

## Goals
- Let me read and edit existing Markdown notes in `zett/` through a clean web UI.
- Keep the experience light: fast load, minimal chrome, no plugin architecture.
- Provide essentials Obsidian-style features I rely on (calendar, mermaid, tables) without extras.

## Highlights
- Theme-aware Mermaid preview with PNG/SVG export per diagram.
- PDF/DOCX export that mirrors the preview styles.
- Calendar with change markers, hover previews, and a day activity list for modified files.
- Configurable linting and a replace-all panel for bulk edits.

## Functional Requirements
- **Authentication**: Simple login form (username/password stored server-side, e.g., env/secret file). Single user is fine; no sign-up or invite flows.
- **Vault location**: All notes live on disk under `zett/`; the app reads/writes directly to those files. No database required.
- **Browsing**: List and open Markdown files/folders from `zett/`; quick navigation and file search by name are enough.
- **Viewing**: Render Markdown with standard syntax, tables, images, and Mermaid diagrams. Rendering should be accurate to source (no Obsidian-only plugins); images (png/jpg/webp/gif/svg) should display inline.
- **Editing**: Text editor with Markdown preview; edits save back to the original file. Basic safety (confirm discard unsaved changes) preferred.
- **Wiki links**: `[[Note]]` opens that note for editing (resolves to `Note.md` relative to the current file). `![[Note]]` embeds the referenced note content in the preview.
- **Flat link resolution**: Wiki links resolve across the whole vault (first match by filename, even if in subfolders like `Daily/Note.md`).
- **Navigation**: Back/Forward history with configurable shortcuts (default `Alt+ArrowLeft` / `Alt+ArrowRight`).
- **Code blocks**: Syntax highlighting for fenced code (bash, python, etc.) using highlight.js.
- **Calendar**: Calendar view to jump to notes by date (e.g., filenames or frontmatter with dates). Clicking a day should show/create that day’s note and load a day activity list of modified files.
- **Weekly calendar**: Week numbers appear alongside the calendar; clicking opens/creates `Weekly notes/YYYY-{W}WW.md` (folder/name configurable), and hovering days/weeks shows a quick preview of the note.
- **File actions**: Create, rename, and delete notes in `zett/` (with confirmation). Folder creation optional but helpful.
- **Search**: Text search across note contents (basic full-text or grep-style) to find and open matching files.
- **Mermaid**: Render Mermaid flowcharts inline in the viewer/preview. Editing Mermaid as code is sufficient; live re-render on save or on-demand. Allow per-diagram PNG/SVG download.
- **Tables**: Ensure Markdown tables render correctly in the viewer/preview; keep editing in plain Markdown.
- **Attachments**: Preserve existing local links/embeds (images, PDFs) if present in `zett/`. Serving static assets from the vault is sufficient; no upload manager required. Inline image display with a simple lightbox/zoom is preferred for readability.
- **Filename control**: Show the current note path at the top; it should be directly editable to rename the note (updates the underlying file).
- **Templates**: New notes use a configurable frontmatter template (defaults include `created`/`updated` timestamps; daily notes also use the template).
- **Search**: Filename matches returned first, then content matches; search limit configurable (default 1000).
- **File tree**: Expandable tree for folders/files (hidden entries skipped), with open/move/delete actions; current file is highlighted in the tree.
- **Autosuggest**: Typing `[[` or `![[` shows a floating suggestion box for files/images to auto-complete links/embeds.
- **Themes**: Multiple themes (dark-first selector with Midnight, Dracula, Monokai, Solarized, Tokyo Night, Nord, Gruvbox, Catppuccin; plus light/paper variants) selectable in the theme picker above settings.
- **Shortcuts**: Configurable shortcuts (save, history navigation, line move, multi-select, sidebar toggle).
- **Export**: Export the current note as PDF or DOCX with Mermaid diagrams rendered.
- **Linting**: Markdown lint with auto-fix rules (trailing whitespace, list spacing, max blank lines, heading levels).

## Non-Functional Requirements
- **Deployment**: Self-hosted; runs locally or on a private server. Browser-based client only.
- **Performance**: Fast load and navigation for a large directory of Markdown files; avoid heavy bundles.
- **Security**: Protect the vault behind login; avoid storing credentials in client storage; serve over HTTPS when deployed remotely.
- **Reliability**: Avoid data loss—atomic/safe writes to files; consider basic versioning or backups later if needed.
- **Compatibility**: Modern Chromium/Firefox/Safari; mobile-friendly layout preferred.

## Out of Scope (for now)
- Multi-user collaboration, sharing, or permissions.
- Plugin ecosystem or community add-ons.
- Sync engine or cloud storage (assume the `zett/` directory is already synced by external tools if needed).
- Rich WYSIWYG beyond Markdown + Mermaid + tables.

## Run Locally
1. Copy `.env.example` to `.env` and set `AUTH_USER`, `AUTH_PASS`, and `SESSION_SECRET` (optionally `PORT` and `VAULT_ROOT`; defaults to `./zett`).
2. Install and start: `npm install` then `npm run dev`.
3. Open `http://localhost:3000` and sign in.

## Deploy (self-hosted)
- Copy `.env.example` to `.env` (on the server) and set `AUTH_USER`, `AUTH_PASS`, `SESSION_SECRET`, optional `PORT`, `VAULT_ROOT`, and `SETTINGS_PATH`.
- Use `deployment/deploy.sh` to rsync the project to your server and install a systemd service:
  - `TARGET_HOST=your.host TARGET_USER=ubuntu REMOTE_PATH=/home/cow/repos/md PORT=3008 deployment/deploy.sh`
  - The script syncs files, runs `npm install --production`, installs the shipped unit, and starts it.
  - Ensure the vault directory (`VAULT_ROOT`) is writable by the service user; `.env` is read from `REMOTE_PATH/.env`.
- Reverse proxy: see `deployment/md_web/md-web.conf` for an example nginx config (HTTP→HTTPS redirect, SSL cert/key placeholders, proxy to the Node service). Use certbot or your CA to populate the `ssl_certificate`/`ssl_certificate_key` paths.
> Tip: the same `.env` in the repo root can be rsynced and used on the server. Default: app listens on 3008, nginx listens on 3009 and proxies to the app; adjust `PORT`/nginx if you change ports.

## Notes
- Calendar uses filenames containing dates (`YYYY-MM-DD` or `YYYYMMDD...`) to highlight existing notes; clicking a day creates/opens a note using the configured template (default `Daily/YYYY-MM-DD DAILY.md`).
- Week rows link to `Weekly notes/YYYY-{W}WW.md` (ISO week; folder/template configurable in settings); existing weekly notes highlight the week number, and you can hover any day or week to see a small preview without opening it.
- Attachments (images, PDFs) are served from `/vault/<path>`; relative Markdown image links resolve to their location next to the current note.
- Settings are stored on disk (`.vault_settings.json` by default; override with `SETTINGS_PATH`) so you can reuse/share your configuration across runs.
- Settings panel lets you set:
  - Daily notes folder (default `Daily` under the vault) used for calendar-created notes when the template lacks a folder.
  - Daily note filename template (default `Daily/YYYY-MM-DD DAILY.md`).
  - Weekly notes folder/filename template and week start day (default Monday).
  - Note template applied on new note creation (supports placeholders `{{created}}`, `{{updated}}`, `{{date}}`, `{{title}}`).
  - File sort order (default modified date, newest first).
  - Shortcut keys.
  - Theme (quick selector above settings) and search limit.
  - Mermaid theme override, font size, and font family.
  - Linting toggles (enable, on-save, and rule selection).
  - Replace-all panel (`Ctrl+Shift+D` by default) for multi-select style bulk edits.

## TODO
- Remote deployment not working well (stability of deploy.sh, sudo/TTY handling, and nginx install steps need improvement).
