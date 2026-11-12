# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-11-11

### Changed

- README: onboarding for GitHub adopters (quick start, MCP for Cursor and Claude Code, tool table, schema)

### Fixed

- Web UI: numbered step list and clearer card sections (repos as chips, section labels)

Local QA sheets and cards (e.g. product smoke scenarios) stay in `~/.bugboard/` only and are not part of the release artifact.

## [0.1.1] - 2026-11-11

### Fixed

- Serve web UI assets from `web/dist` so `/assets/*` returns 200 instead of 404

## [0.1.0] - 2026-11-11

### Added

- Local HTTP API and SQLite persistence under `~/.bugboard/`
- MCP stdio server with board, sheet, and bug tools
- PT-BR web UI with sheet tabs and Passou/Falhou validation
- CLI: `serve`, `open`, `status`, `mcp`
