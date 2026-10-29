const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const packageJson = require("../package.json");
const { sections } = require("../scripts/test-stable.cjs");

function runCli(...args) {
  return execFileSync(process.execPath, [path.resolve(__dirname, "../dist/cli.js"), ...args], {
    encoding: "utf8"
  });
}

test("l'aide FBP ne mentionne plus l'autocomplétion VS Code", () => {
  const output = runCli("help");
  assert.doesNotMatch(output, /Dans VS Code, FBP .* propose l’autocomplétion/);
  assert.match(output, /fbp run-file/);
});

test("FBP sans argument affiche la même aide simplifiée", () => {
  const output = runCli();
  assert.doesNotMatch(output, /Dans VS Code, FBP .* propose l’autocomplétion/);
  assert.match(output, /FBP — French Bot Programming/);
});

test("la commande de validation stable est déclarée et contient 42 contrôles", () => {
  assert.equal(packageJson.scripts.testStable, "node scripts/test-stable.cjs");
  assert.equal(sections.reduce((total, section) => total + section.checks.length, 0), 42);
});

test("la validation stable ne prétend pas passer si un contrôle échoue", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../scripts/test-stable.cjs"), "utf8");
  assert.match(source, /STATUT : NOT PASS/);
  assert.match(source, /STATUT : TESTS GOOD PASS/);
  assert.match(source, /process\.exitCode = 1/);
});
