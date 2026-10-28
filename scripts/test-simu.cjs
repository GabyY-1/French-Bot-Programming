const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const testFiles = fs.readdirSync(path.join(root, "tests"))
  .filter(file => file.endsWith(".test.cjs"))
  .map(file => path.join("tests", file));

console.log("FBP — suite de simulation");
console.log("Mode : tests locaux, sans connexion à Discord");
console.log("");

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, FBP_TEST_MODE: "1" }
});

if (result.error) {
  console.error("Impossible de lancer les tests :", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
