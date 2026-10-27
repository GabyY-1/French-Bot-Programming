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

test("fbp -init installe le support VS Code quand il est absent", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-init-fresh-"));
  try {
    const result = run(["-init"], cwd, { ...process.env, HOME: cwd, USERPROFILE: cwd, VSCODE_AGENT_FOLDER: path.join(cwd, ".vscode-agent") });
    assert.equal(result.status, 0);
    assert.ok(fs.existsSync(path.join(cwd, "commandes.fbp")));
    assert.ok(fs.existsSync(path.join(cwd, "scripts", "main.fbp")));
    assert.ok(fs.existsSync(path.join(cwd, ".vscode-agent", "extensions", "gabyy1.fbp-language-1.2.3", "package.json")));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("fbp -init conserve les fichiers du projet et une extension existante", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-init-"));
  const extensionDir = path.join(cwd, ".vscode-agent", "extensions", "gabyy1.fbp-language-1.2.3");
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.writeFileSync(path.join(extensionDir, "package.json"), '{"name":"existing-extension"}\n', "utf8");
  fs.writeFileSync(path.join(extensionDir, "marker.txt"), "à conserver", "utf8");
  fs.writeFileSync(path.join(cwd, "commandes.fbp"), '{"custom":"custom.fbp"}\n', "utf8");
  fs.mkdirSync(path.join(cwd, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "scripts", "main.fbp"), 'affiche("existant")\n', "utf8");
  try {
    const result = run(["-init"], cwd, { ...process.env, HOME: cwd, USERPROFILE: cwd, VSCODE_AGENT_FOLDER: path.join(cwd, ".vscode-agent") });
    assert.equal(result.status, 0);
    assert.equal(fs.readFileSync(path.join(cwd, "commandes.fbp"), "utf8"), '{"custom":"custom.fbp"}\n');
    assert.equal(fs.readFileSync(path.join(cwd, "scripts", "main.fbp"), "utf8"), 'affiche("existant")\n');
    assert.equal(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"), '{"name":"existing-extension"}\n');
    assert.equal(fs.readFileSync(path.join(extensionDir, "marker.txt"), "utf8"), "à conserver");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("la version du CLI est 1.2.3", () => {
  const result = run(["version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /FBP 1.2.3/);
});
