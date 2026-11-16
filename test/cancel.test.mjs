// Run after `npm run build`: node --test test/cancel.test.mjs  (temp dir only, never ~/.bugboard)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BUGBOARD_DATA_DIR = mkdtempSync(join(tmpdir(), "bb-cancel-"));
const db = await import("../dist/db.js");

test("cancel a card, count it, reopen it", () => {
  const sheet = db.createSheet("Cancel");
  const j = db.createBug(sheet.id, { title: "Jornada", kind: "journey" });
  const uc = db.createBug(sheet.id, { title: "Botao que sumiu", parent_id: j.id, status: "testar" });

  const cancelled = db.cancelBug(uc.id, "A tela mudou e isso não existe mais");
  assert.equal(cancelled.status, "cancelado");
  assert.equal(cancelled.note, "A tela mudou e isso não existe mais");
  assert.equal(db.boardStats(sheet.id).cancelado, 1);
  assert.equal(db.listBugsFlat(sheet.id, "cancelado").length, 1);

  const reopened = db.updateBug(uc.id, { status: "fazendo" });
  assert.equal(reopened.status, "fazendo");
  assert.equal(reopened.round, 1);
  assert.equal(db.boardStats(sheet.id).cancelado, 0);
  assert.equal(db.cancelBug("nope"), null);
});
