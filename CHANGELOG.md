# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
