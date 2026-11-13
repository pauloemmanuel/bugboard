import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachmentLines, insertToken, removeToken, tokensIn } from "../web/src/imageTokens.ts";

test("token insert, remove, lines", () => {
  const r = insertToken("deu erro aqui", 8, 1);
  assert.equal(r.text, "deu erro [Imagem #1] aqui");
  assert.deepEqual(tokensIn(r.text), [1]);
  assert.equal(removeToken(r.text, 1), "deu erro aqui");
  assert.deepEqual(attachmentLines(r.text, [{ n: 1, path: "/x/1.png" }, { n: 2, path: "/x/2.png" }]), [
    "[Imagem #1]: /x/1.png",
  ]);
});

test("upload validation, numbering, storage", async () => {
  process.env.BUGBOARD_DATA_DIR = mkdtempSync(join(tmpdir(), "bb-att-"));
  const db = await import("../src/db.ts");
  assert.ok("error" in db.validateImageUpload("image/gif", 10));
  assert.ok("error" in db.validateImageUpload("image/png", 11 * 1024 * 1024));
  const s = db.createSheet("S");
  const b = db.createBug(s.id, { title: "x" })!;
  const a1 = db.addAttachment(b.id, Buffer.from("a"), "image/png");
  const a2 = db.addAttachment(b.id, Buffer.from("b"), "image/jpeg");
  assert.ok(typeof a1 !== "string" && typeof a2 !== "string");
  if (typeof a1 === "string" || typeof a2 === "string") return;
  assert.equal(a1.n, 1);
  assert.equal(a2.n, 2);
  assert.ok(a1.path.endsWith(`${b.id}/1.png`) && existsSync(a1.path));
  assert.equal(db.getBug(b.id)!.attachments!.length, 2);
  assert.ok(db.removeAttachment(b.id, 1));
  assert.equal(existsSync(a1.path), false);
});
