# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.6] - 2026-11-12

### Added

- Web UI: **Falhou** opens a required motivo prompt; saves to `note` via `failBug(id, note)`
- Failed cards show **Por que falhou** with a highlighted reason block (poll and optimistic update keep it in sync)

## [0.3.5] - 2026-11-12

### Changed

- Web UI: `Ambiente: LOCAL|STAGING|PROD` in prep renders as a header chip on the card, not a copy row in Preparação
- E-mail and Senha (Password) keep value-only copy buttons in Preparação

## [0.3.4] - 2026-11-12

### Added

- Web UI: prep lines `Ambiente` / `E-mail` / `Senha` / `Password` render with bold values and separate copy buttons; other prep lines get a compact copy control
- Clipboard feedback: brief "Copiado" state on copy actions

### Changed

- Long fix/where/note text uses a de-emphasized scrollable block so prep stays scannable
- API responses and browser fetches use `no-store` so the 2.5s poll refreshes nested use case cards without F5

## [0.3.3] - 2026-11-12

### Added

- Web UI: soft poll every 2.5s while the tab is visible so MCP and API changes show without F5
- Polling pauses when the tab is hidden; refresh keeps the active sheet, scroll, and no loading spinner

## [0.3.2] - 2026-11-12

### Changed

- Web UI: tab switch and pass/fail no longer blank the board with a full reload spinner
- Pass, fail, reopen, and ready-to-test update cards optimistically and refresh stats in the background
- Scroll position is kept when data updates in place

## [0.3.1] - 2026-11-12

### Changed

- Archive tab dialog: title and button say Arquivar, Cancelar and Esc are blocked while the request runs, errors show a plain message and reload the list, focus moves to the active tab afterward, close button hit area is 44px

## [0.3.0] - 2026-11-12

### Added

- UI: close button on each sheet tab with a confirm dialog (archives via `PATCH /api/sheets/:id`, same as MCP `sheet_archive`)
- After archiving the active tab, selection moves to the neighbor sheet

## [0.2.2] - 2026-11-12

### Changed

- Cards, tabs, filters, and buttons use 12 to 16px radius and pill controls
- Nested use cases sit on a soft left accent instead of a hard square frame
- Light and dark colors stay on CSS variables, with solid high-contrast text
- Empty preparação copy no longer asks an agent to fill the mass

## [0.2.1] - 2026-11-11

### Changed

- Platform marks use Lucide (`Monitor` for web, `Tablet` for iPad) and Simple Icons paths (Apple, Android) in a 20px badge
- Use case stack sits on a left border; status badges include Check, X, Eye, and CircleDashed

## [0.2.0] - 2026-11-11

### Added

- Journey vs use case hierarchy: `parent_id`, `kind`, `platform`, `prep` on cards
- SQLite migration for existing `~/.bugboard` databases (schema user_version 2)
- Nested `bug_list` / `GET /api/sheets/:id/bugs` with `children[]`
- Platform icons (iOS, Android, Web, iPad) on journey cards
- UI: child use case stack, **Preparação** section, journey child progress (`3/7 ok`)
- MCP `bug_create` / `bug_update` accept `parent_id`, `kind`, `platform`, `prep`

### Changed

- Breaking-ish card model: prefer journeys (roots) with atomic use case children; pass/fail is per card (parent pass does not auto-pass children)

Local QA sheets and cards (e.g. product smoke scenarios) stay in `~/.bugboard/` only and are not part of the release artifact.

## [0.1.2] - 2026-11-11

### Changed

- README: onboarding for GitHub adopters (quick start, MCP for Cursor and Claude Code, tool table, schema)

### Fixed

- Web UI: numbered step list and clearer card sections (repos as chips, section labels)

## [0.1.1] - 2026-11-11

### Fixed

- Serve web UI assets from `web/dist` so `/assets/*` returns 200 instead of 404

## [0.1.0] - 2026-11-11

### Added

- Local HTTP API and SQLite persistence under `~/.bugboard/`
- MCP stdio server with board, sheet, and bug tools
- PT-BR web UI with sheet tabs and Passou/Falhou validation
- CLI: `serve`, `open`, `status`, `mcp`
