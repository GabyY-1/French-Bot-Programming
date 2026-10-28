const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FbpCompiler } = require("../dist/compiler.js");

function run(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fbp-133-"));
  const file = path.join(directory, "main.fbp");
  fs.writeFileSync(file, source, "utf8");
  try {
    const compiler = new FbpCompiler({ connectDiscord: false, onOutput: () => {} });
    compiler.runFile(file);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("les commandes contextuelles utilisateur et message sont déclarables", () => {
  assert.doesNotThrow(() => run([
    "connexion()",
    'commandeContextuelleUtilisateur("Voir utilisateur")',
    'commandeContextuelleMessage("Voir message")'
  ].join("\n")));
});

test("les événements vocaux acceptent les trois transitions", () => {
  assert.doesNotThrow(() => run([
    "connexion()",
    'evenementVocal("arrivee", "{{pseudo}} rejoint {{nouveau}}")',
    'evenementVocal("depart", "{{pseudo}} quitte {{ancien}}")',
    'evenementVocal("changement", "{{pseudo}} change de salon")'
  ].join("\n")));
});

test("vocalRejoindre rejette un identifiant de salon invalide", () => {
  assert.throws(() => run('connexion()\nvocalRejoindre("pas-un-id")'), /Identifiant|Utilisation|salon vocal/i);
});

test("invitationCreer rejette un identifiant de salon invalide", () => {
  assert.throws(() => run('connexion()\ninvitationCreer("pas-un-id", 3600)'), /invitation invalide/i);
});

test("sondageCreer valide les identifiants avant toute requête Discord", () => {
  assert.throws(() => run('connexion()\nsondageCreer("bad", "Question ?", "Oui", "Non")'), /sondage|choix valides/i);
});

test("webhookEnvoyer refuse les URL qui ne sont pas des webhooks Discord", () => {
  assert.throws(() => run('webhookEnvoyer("https://example.com/webhook", "Bonjour")'), /URL Discord|URL de webhook/i);
});

test("evenementCreer refuse un identifiant de salon invalide", () => {
  assert.throws(() => run('connexion()\nevenementCreer("bad", "Réunion", "2027-06-11T18:00:00Z")'), /événement invalide/i);
});
