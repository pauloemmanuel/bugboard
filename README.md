# Bugboard

Local bug board with Excel-like sheets. MCP clients create cards; humans validate with **Passou** / **Falhou** in the browser.

**Board data lives in `~/.bugboard/` on each machine (local SQLite). Cloning this repo does not include anyone's cards or sheets.**

```bash
npm install && npm run build
node dist/index.js open
```

Port `3847` (`BUGBOARD_PORT`). CLI: `serve` | `open` | `status` | `mcp`.

## MCP

```json
"bugboard": {
  "command": "node",
  "args": ["/absolute/path/to/bugboard/dist/index.js", "mcp"]
}
```

Add to Cursor `~/.cursor/mcp.json` or Claude `~/.claude.json` (`mcpServers`). Restart IDE after edits. See `.mcp.json` in this repo.

## Changelog

[CHANGELOG.md](./CHANGELOG.md). MIT, Paulo Emmanuel.
