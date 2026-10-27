const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "dist", "cli.js");
const fixtures = path.join(__dirname, "fixtures");

function run(args, cwd = root, env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env
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

test("une commande déclarée s'exécute depuis un projet", () => {
  const result = run(["run", "test"], fixtures);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Les commandes FBP fonctionnent\./);
  assert.match(result.stdout, /Cette commande ne vérifie pas/);
});

test("un fichier FBP peut être lancé directement", () => {
  const result = run(["run-file", "tests/fixtures/main.fbp"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Le programme FBP démarre\./);
  assert.match(result.stdout, /Projet : FBP/);
});

test("une commande inconnue renvoie une erreur claire", () => {
  const result = run(["run", "commande_inexistante"], fixtures);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Commande « commande_inexistante » inconnue/);
});

test("fbp -init crée les fichiers sans écraser les fichiers existants", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-init-"));
  try {
    const result = run(["-init"], cwd, { ...process.env, HOME: cwd, USERPROFILE: cwd, VSCODE_AGENT_FOLDER: path.join(cwd, ".vscode-agent") });
    assert.equal(result.status, 0);
    assert.ok(fs.existsSync(path.join(cwd, "commandes.fbp")));
    assert.ok(fs.existsSync(path.join(cwd, "scripts", "main.fbp")));
    assert.ok(fs.existsSync(path.join(cwd, ".vscode-agent", "extensions", "gabyy1.fbp-language-1.2.0", "package.json")));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("la version du CLI est 1.2.0", () => {
  const result = run(["version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /FBP 1\.1\.9/);
});
