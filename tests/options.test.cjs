const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FbpCompiler } = require("../dist/compiler");

function runSource(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-options-"));
  const file = path.join(dir, "main.fbp");
  fs.writeFileSync(file, source, "utf8");
  try {
    new FbpCompiler({ onOutput: () => {} }).runFile(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("un choix ne peut pas viser une commande inexistante", () => {
  assert.throws(
    () => runSource('discordChoixTexte("inconnue", "couleur", "Bleu", "bleu")'),
    /n'est pas déclarée/
  );
});

test("un choix entier refuse une valeur décimale", () => {
  assert.throws(
    () => runSource([
      'discordConnexion()',
      'discordCommande("niveau", "Niveau")',
      'discordOptionEntier("niveau", "valeur", "Choisis un niveau")',
      'discordChoixEntier("niveau", "valeur", "Moyen", 1.5)'
    ].join("\n")),
    /Token Discord manquant|nombre entier/
  );
});
