import test from "node:test";
import assert from "node:assert/strict";
import { LANGS, MESSAGES, translate } from "../web/src/i18n.tsx";
import { buildFailAiPrompt } from "../web/src/failAiPrompt.ts";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("all 10 languages translate every key with the same placeholders", () => {
  assert.equal(LANGS.length, 10);
  const keys = Object.keys(MESSAGES.en);
  for (const { code } of LANGS) {
    const dict = MESSAGES[code];
    assert.deepEqual(Object.keys(dict).sort(), [...keys].sort(), code);
    for (const k of keys) {
      const v = dict[k as keyof typeof dict];
      assert.ok(v.trim(), `${code}.${k} empty`);
      assert.deepEqual(placeholders(v), placeholders(MESSAGES.en[k as keyof typeof MESSAGES.en]), `${code}.${k}`);
      assert.ok(!v.includes("—"), `${code}.${k} has an em dash`);
    }
  }
  assert.equal(translate("pt", "progress", { ok: 3, total: 7 }), "3/7 ok");
});

test("fail prompt is English, compact and carries the card id", () => {
  const bug = {
    id: "abc-123", sheet_id: "s", n: 153, title: "Android: borders", repos: ["app"], status: "falhou",
    where: "Family panel > minors", steps: ["open the panel", "look at the card"], fix: "", round: 2, note: "",
    parent_id: null, kind: "usecase", platform: "android", prep: [],
  } as const;
  const p = buildFailAiPrompt("Fluxo menor", bug as never, "looks rough [Imagem #1]", [{ n: 1, path: "/x/1.png" }]);
  assert.match(p, /^Bugboard card #153 FAILED QA \(sheet "Fluxo menor", round 2, id abc-123\)/);
  assert.match(p, /Reason: looks rough/);
  assert.match(p, /\[Imagem #1\]: \/x\/1\.png/);
  assert.match(p, /Steps: 1\. open the panel 2\. look at the card/);
  assert.match(p, /bug_get/);
  assert.doesNotMatch(p, /Motivo|Passos|Onde|Corrige/);
});
