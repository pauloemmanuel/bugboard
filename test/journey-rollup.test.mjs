// Run after `npm run build`: node --test test/journey-rollup.test.mjs  (temp dir only, never ~/.bugboard)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BUGBOARD_DATA_DIR = mkdtempSync(join(tmpdir(), "bb-rollup-"));
const db = await import("../dist/db.js");

test("journey status follows its use cases", () => {
  const sheet = db.createSheet("Rollup");
  const j = db.createBug(sheet.id, { title: "Epic", kind: "journey" });
  const a = db.createBug(sheet.id, { title: "A", parent_id: j.id });
  const b = db.createBug(sheet.id, { title: "B", parent_id: j.id });
  const st = () => db.getBug(j.id).status;

  assert.equal(st(), "fazendo");
  db.updateBug(a.id, { status: "testar" });
  assert.equal(st(), "fazendo", "one child still in progress");
  db.updateBug(b.id, { status: "testar" });
  assert.equal(st(), "testar", "all children to test moves the epic");
  db.failBug(a.id, "broken");
  assert.equal(st(), "testar", "B still waits for QA");
  db.passBug(b.id);
  assert.equal(st(), "falhou");
  db.cancelBug(a.id, "screen changed");
  assert.equal(st(), "ok", "cancelled child is ignored");
  db.createBug(sheet.id, { title: "C", parent_id: j.id });
  assert.equal(st(), "fazendo", "new child reopens the epic");
});

test("rollupStatus keeps journeys without active children untouched", () => {
  assert.equal(db.rollupStatus([]), null);
  assert.equal(db.rollupStatus(["cancelado"]), null);
  assert.equal(db.rollupStatus(["ok", "ok"]), "ok");
});
