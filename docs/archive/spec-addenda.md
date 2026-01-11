# Spec Addenda (Archived)

This file contains archived addendum specifications that are no longer part of the main `SPEC.md`
but are retained for historical context.

---

# Addendum Specification: Markdown Linting + Calendar Change Surfacing

## Overview

Add two capabilities:

1) Markdown linting with auto-correct for common formatting issues, including configurable list spacing rules.
2) Calendar indicators for notes modified on each day with quick access to open those notes.

## Goals

- Provide a simple lint flow that can run on demand and optionally auto-correct on save.
- Support a rule to disallow blank lines between list items, configurable via settings.
- Surface recently modified notes per day directly in the calendar for faster access.

## Non-goals

- Comprehensive Markdown formatting/linting coverage.
- Timeline or analytics view of edits beyond per-day listing.

## UX Requirements

### Markdown linting

- Add a “Lint” action in the editor toolbar.
- Optional “lint on save” toggle in settings.
- Auto-correct lint fixes, and report how many fixes were applied.

### Calendar changes

- Indicate calendar days with modified notes using a distinct marker.
- On hover, show a list of modified notes for that day with clickable entries.
- On click, open a “Day activity” panel listing files created or modified on that day.
- Day activity list supports multi-select and quick actions: open, open in split, delete, move.
- Show a count badge per day (excluding the daily note by default; toggle to include).

## Functional Requirements

### Markdown linting

- Support a rule to disallow blank lines between list items.
- Auto-correct removes blank lines between adjacent list items in the same list.
- Linting settings are stored alongside existing user settings.

### Calendar changes

- Provide an endpoint to return notes modified for a given month.
- Use the local modification date (`mtime`) and return up to a safe cap per day.
- UI pulls change data for the visible month and uses it for hover previews.
- Provide an endpoint to return files created/modified for a single day.
- Use `ctime` (created) and `mtime` (modified) for day activity listing.
- Exclude the daily note by default; allow opt-in via a query flag.

## Error Handling

- Linting errors should fail gracefully and never block saving.
- Calendar change endpoint failures should fall back to the existing calendar view without blocking.

## Review Checklist

- ✅ Lint action produces deterministic output and does not corrupt Markdown.
- ✅ “No blank lines between list items” is configurable and enforced when enabled.
- ✅ Calendar hover list shows modified notes and clicking opens the note.
- ✅ No new external dependencies are required for linting.

---

# Addendum Specification: Lint Rules + Recent Changes Sidebar

## Overview

Extend markdown linting with additional auto-fix rules and surface recent changes in a sidebar list.

## Goals

- Provide optional lint rules for trailing whitespace cleanup and heading level consistency.
- Display a recent changes list that aggregates the calendar change data and supports sorting.

## UX Requirements

### Lint rules

- Add toggles for new lint rules in settings.
- Lint action and lint-on-save should apply enabled rules only.

### Recent changes sidebar

- Add a “Recent changes” panel in the sidebar showing a list of notes.
- Provide sorting controls (e.g., newest first, oldest first, title).
- Clicking an entry opens the note.

## Functional Requirements

### Lint rules

- Trailing whitespace is trimmed from lines when enabled.
- Heading level consistency prevents skipping heading levels by lowering the level to the previous heading + 1.

### Recent changes

- Aggregate change data for the most recent ~60 days (current + previous month).
- Limit the list length to a reasonable cap for performance.

## Review Checklist

- ✅ Lint rules are toggleable and only affect enabled behavior.
- ✅ Heading level fixes are deterministic and do not remove content.
- ✅ Recent changes list updates after calendar data refresh and opens notes on click.
