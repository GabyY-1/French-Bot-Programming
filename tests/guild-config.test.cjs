const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FbpCompiler } = require("../dist/compiler.js");

function runSource(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-guild-config-"));
  const file = path.join(directory, "main.fbp");
  fs.writeFileSync(file, source, "utf8");
  const compiler = new FbpCompiler({ connectDiscord: false, onOutput: () => undefined });
  try {
    compiler.runFile(file);
    return compiler;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("les configurations sont séparées par identifiant de serveur", () => {
  const compiler = runSource(
    'configurationServeur("12345678901234567", "salutation", "Bienvenue {{membre}}")\n' +
    'configurationServeur("12345678901234568", "salutation", "Salut {{membre}}")\n'
  );

  assert.equal(compiler.renderGuildTemplate("{{config:salutation}}", "12345678901234567", { membre: "Alex" }), "Bienvenue Alex");
  assert.equal(compiler.renderGuildTemplate("{{config:salutation}}", "12345678901234568", { membre: "Sam" }), "Salut Sam");
  assert.equal(compiler.renderGuildTemplate("{{config:salutation}}", "12345678901234569"), "{{config:salutation}}");
});

test("une configuration de serveur invalide est refusée", () => {
  assert.throws(
    () => runSource('configurationServeur("pas-un-id", "salutation", "Bonjour")\n'),
    /Configuration invalide/
  );
});

test("les clés de configuration sont validées", () => {
  assert.throws(
    () => runSource('configurationServeur("12345678901234567", "Clé invalide", "Bonjour")\n'),
    /Configuration invalide/
  );
});
