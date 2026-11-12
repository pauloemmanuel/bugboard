# Bugboard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Bugboard is a **local bug board** with Excel-like **sheet tabs**. Any AI coding agent that speaks MCP can create and update cards; humans mark **Pass** or **Fail** in the browser. Run it on your machine, or bind the HTTP server to your LAN if you want a small team to share one board.

*PT: quadro local de bugs com abas tipo planilha; agentes MCP criam cards, humanos validam no navegador.*

The UI is a flat, high-contrast board: sheet tabs across the top, status filters, and cards with numbered steps, repo chips, and Pass/Fail actions when a card is ready to test.

## Quick start

```bash
git clone https://github.com/pauloemmanuel/bugboard.git
cd bugboard
npm install
npm run build
node dist/index.js open
```

Default URL: `http://127.0.0.1:3847` (override with `BUGBOARD_PORT`).

**Global install (optional):**

```bash
npm link
bugboard open
```

CLI: `serve` | `open` | `status` | `mcp`.

## Data location

All board data lives in **`~/.bugboard/`** (SQLite). Cloning this repo does **not** copy anyone's sheets or cards. Each machine has its own database.

## Sheets workflow

1. Create **sheets** (tabs) for a project, release, or device matrix.
2. Agents add **bug cards** to a sheet via MCP or the HTTP API.
3. Developers move cards to `testar` when a fix is ready.
4. Testers use **Passou** / **Falhou** in the UI (`ok` / `falhou`).

Archived sheets are hidden from the default list (MCP: `sheet_archive`).

## Journeys and use cases

**Journey** cards (`kind: journey`, `parent_id` null) group a device or platform run (e.g. iOS Wellmexh 80/20). **Use case** cards (`kind: usecase`, `parent_id` set) are atomic flows inside that journey (signup, chat, wallet). Each use case has its own status, steps, and pass/fail; one failure does not block the whole journey. Journey cards show child progress (`3/7 ok`) from use case statuses; marking a journey **Passou** does not auto-pass children.

`prep` is a string array of test data the agent should fill (emails, MFA codes, package names, URLs). The UI shows **Preparação** on use cases.

`platform` on journeys: `ios` | `android` | `web` | `ipad` (icons in the UI). Children may inherit display from the parent.

`bug_list` and `GET /api/sheets/:id/bugs` return **nested** journeys with `children[]`.

## Card schema

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Required |
| `kind` | enum | `journey` (root) or `usecase` (child) |
| `parent_id` | string? | Parent journey id for use cases |
| `platform` | enum? | `ios`, `android`, `web`, `ipad` |
| `prep` | string[] | Test data / massa for agents to fill |
| `repos` | string[] | Repo names or paths (display only) |
| `status` | enum | See below |
| `where` | string | Environment or surface to test |
| `steps` | string[] | Repro or QA steps (one string per step) |
| `fix` | string | What changed or what to verify |
| `round` | number | Increments when a failed card returns to `testar` |
| `note` | string | Tester notes on pass/fail |

### Statuses

| Status | Meaning |
| --- | --- |
| `fazendo` | In progress |
| `testar` | Ready for human QA |
| `ok` | Passed |
| `falhou` | Failed |

## MCP setup

Bugboard exposes a **stdio MCP server**. Point your IDE at `dist/index.js mcp` after `npm run build`.

### Cursor

Edit `~/.cursor/mcp.json` (or project MCP config):

```json
{
  "mcpServers": {
    "bugboard": {
      "command": "node",
      "args": ["/absolute/path/to/bugboard/dist/index.js", "mcp"]
    }
  }
}
```

With a global binary after `npm link`:

```json
{
  "mcpServers": {
    "bugboard": {
      "command": "bugboard",
      "args": ["mcp"]
    }
  }
}
```

Restart Cursor after changes.

### Claude Code

Add the same block under `mcpServers` in `~/.claude.json` (or your Claude Code MCP config). Restart the CLI session.

See also [`.mcp.json`](./.mcp.json) in this repo for a working absolute-path example.

## MCP tools

| Tool | Description |
| --- | --- |
| `board_status` | Health, DB path, port, aggregate counts |
| `board_open` | Start HTTP server if needed, open browser |
| `sheet_list` | List sheets (optional `include_archived`) |
| `sheet_create` | Create a sheet tab |
| `sheet_rename` | Rename a sheet |
| `sheet_archive` | Archive a sheet |
| `bug_list` | List bugs on a sheet (optional `status` filter) |
| `bug_get` | Get one bug by id |
| `bug_create` | Create a card |
| `bug_update` | Patch fields (round auto-increment rules apply) |
| `bug_pass` | Human pass (`ok`) |
| `bug_fail` | Human fail (`falhou`) |

## HTTP API

The SPA uses `GET/PATCH /api/...` on the same port as the UI. Useful for scripts; agents should prefer MCP.

## Changelog

We follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](./CHANGELOG.md).

## Contributing

Issues and PRs welcome on [GitHub](https://github.com/pauloemmanuel/bugboard). Keep changes small and documented in the changelog.

## License

MIT. Copyright Paulo Emmanuel. See [LICENSE](./LICENSE).
