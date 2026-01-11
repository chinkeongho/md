# Specification: Mermaid Preview + Export (PDF/DOCX)

## Overview

Define the end-to-end behavior for Mermaid rendering, export, calendar change surfacing, linting, and backlinks in the single-user markdown editor. The system is self-hosted, reads/writes a disk vault, and provides a fast, focused UI without plugins.

## Features (Current)

- Mermaid preview with theme-aware rendering, PNG/SVG export per diagram, and configurable Mermaid theme/font settings.
- PDF/DOCX export with Mermaid rendered in-headless Chromium; export styling mirrors app preview.
- Calendar change markers by day, hover previews, and a persistent day activity list with selectable files.
- Day activity “Open selected” launches a multi-file preview list for quick inspection and open-in-editor.
- Markdown linting with auto-fix rules (trim trailing whitespace, no blank lines between list items, max one blank line, heading level smoothing).
- Backlinks section appended to preview, listing notes that reference the current note.
- Lightweight, self-hosted app with fast navigation across notes.

## Non-goals

- Mermaid live-edit visual editor; editing remains text-based.
- Full document styling system or templating engine for exports.
- Multi-document batch export.
- Global full-text indexer or cross-vault analytics.

## User Stories

- As a user, I can write Mermaid diagrams in Markdown and see them rendered in the preview.
- As a user, I can export the current note as PDF with Mermaid diagrams rendered.
- As a user, I can export the current note as DOCX with Mermaid diagrams rendered.
- As a user, I can save a Mermaid diagram as a standalone image file from within the note.
- As a user, I can see which notes link to the current note and jump to them.
- As a user, I can browse files modified on a given day and preview them before opening.

## UX Requirements

- Mermaid rendering
  - Detect fenced code blocks with language `mermaid` and render inline.
  - Render on initial preview load and update on save, or on-demand with a refresh button.
  - Match existing theme colors where possible (light/dark support).
  - Respect Mermaid theme override and font size/family settings.

- Export
  - Add an "Export" button with PDF and DOCX options in the editor toolbar.
  - Exports should use current note content, including Markdown, tables, code blocks, images, and Mermaid.
  - Provide a progress indicator for long exports.
  - PDF background is forced to white regardless of app theme.

- Standalone Mermaid image
  - For each Mermaid block, provide a small action menu: "Save diagram as PNG" and "Save diagram as SVG".
  - Default filename: `<note-name>-diagram-<index>.<ext>`.

- Backlinks
  - Show a "Linked from" section at the bottom of preview.
  - List up to 50 items with a "Show more" toggle.
  - Each item includes path/title and optional snippet; clicking opens the note.

- Day activity
  - Clicking a day loads a stable list of modified/created files in the sidebar.
  - "Open selected" opens a modal list with a preview panel for quick inspection.

## Functional Requirements

### Mermaid Rendering

- Parse Markdown to HTML as currently implemented.
- Convert Mermaid fenced blocks into render targets.
- Run Mermaid render in the browser to generate SVG.
- For export pipelines, provide server-side rendering of Mermaid into SVG/PNG.
- Support Mermaid theme overrides (`default`, `neutral`, `dark`, `forest`, `base`) with `auto` mapping to app theme.
- Support Mermaid font size (px) and font family (auto/sans/serif/mono/custom).

### PDF Export

- Server-side export endpoint that accepts a note path and returns PDF.
- Export pipeline should:
  - Resolve Markdown to HTML.
  - Render Mermaid blocks to SVG or PNG and inline them.
  - Convert HTML to PDF.
- PDF should include:
  - Document title (from note filename or frontmatter `title`).
  - Page numbers (optional, config-driven).
- Export HTML inlines the app CSS for preview-matching layout.
- Body background must be white for print/export.

### DOCX Export

- Server-side export endpoint that accepts a note path and returns DOCX.
- Export pipeline should:
  - Resolve Markdown to HTML or a Markdown-to-DOCX flow.
  - Convert Mermaid blocks to images and embed them.

### Permissions/Security

- Export endpoints are protected by existing session auth.
- Note paths must be validated and constrained within `VAULT_ROOT`.

### Backlinks

- Server endpoint scans markdown for wiki links and standard markdown links.
- Backlinks ignore self-references and return a snippet of the matching line.

### Calendar Day Activity

- Server endpoint returns files created/modified on a specific date (ctime/mtime).
- Client renders a selectable list and a modal preview list for selected files.

## Technical Approach

### Mermaid (Client)

- Use `mermaid` npm package to render SVG in preview.
- Use a renderer hook in the Markdown pipeline:
  - Replace `mermaid` code block HTML with a placeholder div.
  - After render, call Mermaid to populate the SVG.
- Maintain a per-block deterministic ID to support re-render on updates.

### Mermaid (Server Export)

- Use `@mermaid-js/mermaid-cli` or headless rendering:
  - Option A: `@mermaid-js/mermaid-cli` to render SVG/PNG server-side.
  - Option B: headless Chromium to render client HTML and print to PDF.
- Preferred: server-side Mermaid render to SVG, then inline in export HTML.

### PDF Export

- Use a headless browser (Playwright or Puppeteer) to render HTML and print to PDF.
- HTML template should mimic the app preview styles with a dedicated print stylesheet.

### DOCX Export

- Implemented: `html-to-docx` in Node to convert rendered HTML to DOCX (pure Node, no external deps).
- Optional alternative: `pandoc` if a system dependency is acceptable.

## API Endpoints

- `GET /api/export/pdf?path=<note>`
  - Response: `application/pdf` with `Content-Disposition: attachment`.
- `GET /api/export/docx?path=<note>`
  - Response: DOCX file download.
- `GET /api/export/mermaid-image?path=<note>&index=<n>&format=png|svg`
  - Response: image file download.
- `GET /api/calendar/day-files?date=<YYYY-MM-DD>&includeDaily=<bool>`
  - Response: `{ date, files: [{ path, created, modified, ctime, mtime }] }`.
- `GET /api/backlinks?path=<note>`
  - Response: `{ backlinks: [{ path, snippet }] }`.

## Data Flow

1) Client requests export for a note.
2) Server loads file from `VAULT_ROOT`.
3) Markdown parser renders HTML with Mermaid placeholders.
4) Mermaid blocks rendered to SVG/PNG.
5) HTML converted to PDF/DOCX with images embedded.

## Configuration

- `EXPORT_PDF_ENABLED` (default true)
- `EXPORT_DOCX_ENABLED` (default true)
- `EXPORT_USE_PANDOC` (default false)
- `EXPORT_PDF_PAGE_SIZE` (default A4)
- `EXPORT_PDF_MARGIN` (default 0.75in)
- Settings:
  - Theme selection and Mermaid theme override.
  - Mermaid font size and font family (with custom font input).
  - Lint rules and lint-on-save toggle.

## Error Handling

- Missing note: 404 with error message.
- Mermaid render failure: include diagram source in a code block fallback, log error.
- Export failure: 500 with friendly error message.
- Backlinks failures fall back to “Backlinks unavailable.”

## Testing

- Unit tests: Markdown pipeline transforms and Mermaid placeholder substitution.
- Integration tests: export endpoints return valid PDF/DOCX.
- Manual test: multi-diagram note; verify image downloads and exports.
- Manual test: backlinks detect wiki/markdown links and open notes.
- Manual test: day activity list selection and modal preview open.

## Rollout

- Feature flag export endpoints behind config toggles.
- Add UI toggles if export is disabled.

## Open Questions

- Should Mermaid be rendered live on every keystroke or only on save/refresh?
- Is PDF export via headless browser acceptable in deployment environments?
- Are external dependencies like `pandoc` permitted on target hosts?

---

## Archived Addenda

Older addendum specifications have been moved to `docs/archive/spec-addenda.md`.
