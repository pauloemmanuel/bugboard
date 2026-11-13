import test from "node:test";
import assert from "node:assert/strict";
import { groupPrepRows, parsePrepCopy } from "../web/src/prepCopy.ts";

test("email + senha stay together, label kept", () => {
  const r = parsePrepCopy("Menor: qa+x@wellmexh.test / QaFluxoMenor1!");
  assert.equal(r.label, "Menor");
  assert.deepEqual(r.values, [
    { kind: "email", value: "qa+x@wellmexh.test" },
    { kind: "senha", value: "QaFluxoMenor1!" },
  ]);
});
test("notes are not copied, commands are", () => {
  const a = parsePrepCopy("Dados: migration (migration já rodada) (adulto)");
  assert.deepEqual(a.values, []);
  const b = parsePrepCopy("Fila (make horizon) e `npm run dev`");
  assert.deepEqual(b.values.map((v) => v.value).sort(), ["make horizon", "npm run dev"]);
});
test("url and plain line", () => {
  assert.deepEqual(parsePrepCopy("Painel: http://localhost:3003/login").values, [
    { kind: "url", value: "http://localhost:3003/login" },
  ]);
  assert.equal(parsePrepCopy("Ter o app aberto").values.length, 0);
  assert.deepEqual(parsePrepCopy("Senha: abc123").values, [{ kind: "senha", value: "abc123" }]);
});
test("group by label", () => {
  const rows = groupPrepRows(["Menor: a@b.co / pw1", "Menor: c@d.co", "Adulto: e@f.co / pw2"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values.length, 3);
});
