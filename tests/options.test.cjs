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
    new FbpCompiler({ onOutput: () => {}, connectDiscord: false }).runFile(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("un choix ne peut pas viser une commande inexistante", () => {
  assert.throws(
    () => runSource('choixTexte("inconnue", "couleur", "Bleu", "bleu")'),
    /n'est pas déclarée/
  );
});

test("un choix entier refuse une valeur décimale", () => {
  assert.throws(
    () => runSource([
      'connexion()',
      'commande("niveau", "Niveau")',
      'optionEntier("niveau", "valeur", "Choisis un niveau")',
      'choixEntier("niveau", "valeur", "Moyen", 1.5)'
    ].join("\n")),
    /Token Discord manquant|nombre entier/
  );
});


test("les options utilisateur et rôle sont acceptées sur les commandes texte", () => {
  assert.doesNotThrow(() => runSource([
    "connexion()",
    'commande("attribution", "Membre : {{membre}}, rôle : {{role}}")',
    'optionUtilisateur("attribution", "membre", "Choisis un membre", true)',
    'optionRole("attribution", "role", "Choisis un rôle", true)'
  ].join("\n")));
});

test("les suggestions d'autocomplétion sont déclarées sur une option dédiée", () => {
  assert.doesNotThrow(() => runSource([
    "connexion()",
    'commande("modele", "Modèle : {{nom}}")',
    'optionAutocompleteTexte("modele", "nom", "Recherche un modèle", true)',
    'suggestionAutocomplete("modele", "nom", "Modèle A", "modele-a")',
    'suggestionAutocomplete("modele", "nom", "Modèle B", "modele-b")'
  ].join("\n")));
});

test("les commandes différées et modifiables sont acceptées", () => {
  assert.doesNotThrow(() => runSource([
    "connexion()",
    'commandeDifferee("traitement", "Traitement terminé.")',
    'commandeModifiable("resultat", "Résultat mis à jour.")'
  ].join("\n")));
});

test("les sous-commandes et groupes sont acceptés", () => {
  assert.doesNotThrow(() => runSource([
    "connexion()",
    'commande("outils", "Commandes outils")',
    'sousCommande("outils", "ping", "Vérifier le bot", "Pong !")',
    'commande("config", "Commandes de configuration")',
    'groupeSousCommandes("config", "salons", "Gestion des salons")',
    `sousCommandeGroupe("config", "salons", "aide", "Afficher l'aide", "Utilise les commandes de configuration.")`
  ].join("\n")));
});


test("les événements de membres et les commandes de modération sont déclarables", () => {
  assert.doesNotThrow(() => runSource([
    "connexion()",
    'evenementMembre("arrivee", "{{pseudo}} a rejoint le serveur.")',
    'evenementMembre("depart", "{{membre}} est parti.")',
    'evenementMembre("pseudo", "{{ancien}} devient {{nouveau}}.")',
    'evenementMembre("roles", "{{anciens_roles}} vers {{nouveaux_roles}}")',
    'evenementMembre("statut", "{{ancien}} vers {{nouveau}}")',
    'commandeBannir("bannir")',
    'commandeExpulser("expulser")',
    'commandeTimeout("timeout")',
    'commandeRetirerTimeout("retirer-timeout")',
    'commandeSurnom("surnom")',
    'commandeDebannir("debannir")',
    'commandeVerifierRole("verifier-role")'
  ].join("\\n")));
});

test("un événement membre inconnu est refusé", () => {
  assert.throws(
    () => runSource(['connexion()', 'evenementMembre("inconnu", "test")'].join("\\n")),
    /Événement inconnu/
  );
});
