const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "dist", "cli.js");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("le CLI affiche son aide", () => {
  const result = run(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /FBP — French Bot Programming/);
  assert.match(result.stdout, /run-file/);
});

test("la commande ping répond", () => {
  const result = run(["ping"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /FBP : opérationnel/);
});

test("une commande déclarée s'exécute", () => {
  const result = run(["run", "test"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Les commandes FBP fonctionnent\./);
  assert.match(result.stdout, /Cette commande ne vérifie pas/);
});

test("un fichier FBP peut être lancé directement", () => {
  const result = run(["run-file", "exemples/bot/main.fbp"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Le programme FBP démarre\./);
  assert.match(result.stdout, /Projet : FBP/);
});

test("une commande inconnue renvoie une erreur claire", () => {
  const result = run(["run", "commande_inexistante"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Commande « commande_inexistante » inconnue/);
});
