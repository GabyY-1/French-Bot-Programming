const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FbpCompiler } = require("../dist/compiler");

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-simu-"));
  try {
    callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("simulation : exécute variables, fonctions et affiche", () => {
  withTempDir(dir => {
    const file = path.join(dir, "main.fbp");
    fs.writeFileSync(file, [
      'nom = "FBP"',
      "niveau = 12",
      "actif = true",
      "",
      "demarrer() {",
      '  affiche("Projet :", nom)',
      '  affiche("Niveau :", niveau)',
      '  affiche("Actif :", actif)',
      "}",
      "",
      "demarrer()",
      ""
    ].join("\n"));
    const output = [];
    new FbpCompiler({ onOutput: value => output.push(String(value)) }).runFile(file);
    assert.deepEqual(output, ["Projet : FBP", "Niveau : 12", "Actif : true"]);
  });
});

test("simulation : signale une syntaxe invalide avec une ligne", () => {
  withTempDir(dir => {
    const file = path.join(dir, "invalid.fbp");
    fs.writeFileSync(file, 'affiche("avant")\nceci n\'est pas valide\n');
    const compiler = new FbpCompiler({ onOutput: () => {} });
    assert.throws(() => compiler.runFile(file), error => {
      assert.match(error.message, /Syntaxe non reconnue/);
      assert.equal(error.line, 2);
      return true;
    });
  });
});

test("simulation : refuse une variable inconnue", () => {
  withTempDir(dir => {
    const file = path.join(dir, "unknown.fbp");
    fs.writeFileSync(file, "affiche(inconnue)\n");
    const compiler = new FbpCompiler({ onOutput: () => {} });
    assert.throws(() => compiler.runFile(file), /Valeur inconnue/);
  });
});

test("simulation : charge une fonction depuis un fichier importé", () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, "fonctions.fbp"), [
      "saluer() {",
      '  affiche("Bonjour")',
      "}",
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "main.fbp"), [
      'import { saluer } de "./fonctions.fbp"',
      "saluer()",
      ""
    ].join("\n"));
    const output = [];
    new FbpCompiler({ onOutput: value => output.push(String(value)) })
      .runFile(path.join(dir, "main.fbp"));
    assert.deepEqual(output, ["Bonjour"]);
  });
});
