# Specification: Mermaid Preview + Export (PDF/DOCX)

## Overview
Add two capabilities to the markdown editor:
1) Render Mermaid diagrams inline in the Markdown viewer/preview.
2) Export the current Markdown document as PDF or DOCX, including rendered Mermaid diagrams.

This spec fits the existing single-user, self-hosted app. No plugin system or external SaaS dependence.

## Goals
- Render Mermaid code blocks inline in the preview with accurate sizing and theme integration.
- Provide a one-click export for PDF and DOCX that embeds Mermaid diagrams as images.
- Keep the app lightweight and self-hosted; avoid bloated bundles.

## Non-goals
- Mermaid live-edit visual editor; editing remains text-based.
- Full document styling system or templating engine for exports.
- Multi-document batch export.

## User Stories
- As a user, I can write Mermaid diagrams in Markdown and see them rendered in the preview.
- As a user, I can export the current note as PDF with Mermaid diagrams rendered.
- As a user, I can export the current note as DOCX with Mermaid diagrams rendered.
- As a user, I can save a Mermaid diagram as a standalone image file from within the note.

## UX Requirements
- Mermaid rendering
  - Detect fenced code blocks with language `mermaid` and render inline.
  - Render on initial preview load and update on save, or on-demand with a refresh button.
  - Match existing theme colors where possible (light/dark support).

- Export
  - Add an "Export" button with PDF and DOCX options in the editor toolbar.
  - Exports should use current note content, including Markdown, tables, code blocks, images, and Mermaid.
  - Provide a progress indicator for long exports.

- Standalone Mermaid image
  - For each Mermaid block, provide a small action menu: "Save diagram as PNG" and "Save diagram as SVG".
  - Default filename: `<note-name>-diagram-<index>.<ext>`.

## Functional Requirements
### Mermaid Rendering
- Parse Markdown to HTML as currently implemented.
- Convert Mermaid fenced blocks into render targets.
- Run Mermaid render in the browser to generate SVG.
- For export pipelines, provide server-side rendering of Mermaid into SVG/PNG.

### PDF Export
- Server-side export endpoint that accepts a note path and returns PDF.
- Export pipeline should:
  - Resolve Markdown to HTML.
  - Render Mermaid blocks to SVG or PNG and inline them.
  - Convert HTML to PDF.
- PDF should include:
  - Document title (from note filename or frontmatter `title`).
  - Page numbers (optional, config-driven).

### DOCX Export
- Server-side export endpoint that accepts a note path and returns DOCX.
- Export pipeline should:
  - Resolve Markdown to HTML or a Markdown-to-DOCX flow.
  - Convert Mermaid blocks to images and embed them.

### Permissions/Security
- Export endpoints are protected by existing session auth.
- Note paths must be validated and constrained within `VAULT_ROOT`.

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
- Option A: `pandoc` if allowed as a system dependency.
- Option B: `html-to-docx` in Node to convert rendered HTML to DOCX.
- Prefer a pure Node solution to avoid external system dependencies.

## API Endpoints
- `GET /api/export/pdf?path=<note>`
  - Response: `application/pdf` with `Content-Disposition: attachment`.
- `GET /api/export/docx?path=<note>`
  - Response: DOCX file download.
- `GET /api/export/mermaid-image?path=<note>&index=<n>&format=png|svg`
  - Response: image file download.

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

## Error Handling
- Missing note: 404 with error message.
- Mermaid render failure: include diagram source in a code block fallback, log error.
- Export failure: 500 with friendly error message.

## Testing
- Unit tests: Markdown pipeline transforms and Mermaid placeholder substitution.
- Integration tests: export endpoints return valid PDF/DOCX.
- Manual test: multi-diagram note; verify image downloads and exports.

## Rollout
- Feature flag export endpoints behind config toggles.
- Add UI toggles if export is disabled.

## Open Questions
- Should Mermaid be rendered live on every keystroke or only on save/refresh?
- Is PDF export via headless browser acceptable in deployment environments?
- Are external dependencies like `pandoc` permitted on target hosts?
