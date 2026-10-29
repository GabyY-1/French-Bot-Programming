#!/usr/bin/env node
"use strict";

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const sections = [
  {
    title: "1. Démarrage et connexion",
    checks: [
      "Le bot démarre avec le fichier FBP prévu, sans erreur dans le terminal.",
      "Le bot se connecte à Discord et reste en ligne pendant plusieurs minutes.",
      "Le token reste masqué et n'apparaît ni dans les logs ni dans les messages d'erreur.",
      "Un arrêt puis un redémarrage du bot ne provoquent pas d'erreur persistante."
    ]
  },
  {
    title: "2. Commandes slash et réponses",
    checks: [
      "Les commandes déclarées dans le fichier FBP apparaissent bien dans Discord.",
      "Une commande simple répond avec le texte attendu.",
      "Une commande avec placeholders remplace correctement les valeurs disponibles.",
      "Une réponse privée reste visible uniquement par la personne qui lance la commande.",
      "Une commande différée répond correctement après le délai de traitement.",
      "Une commande inconnue ou mal utilisée produit un retour compréhensible, sans faire planter le bot."
    ]
  },
  {
    title: "3. Options et commandes avancées",
    checks: [
      "Une option texte transmet la valeur saisie correctement.",
      "Les options utilisateur, rôle et salon transmettent la bonne cible.",
      "Les options obligatoires empêchent l'envoi d'une commande incomplète.",
      "L'autocomplétion propose les choix attendus et filtre correctement les suggestions.",
      "Les sous-commandes et groupes affichent les options attendues.",
      "Les commandes contextuelles utilisateur et message ciblent le bon élément."
    ]
  },
  {
    title: "4. Embeds et configuration",
    checks: [
      "Un embed s'affiche avec le bon titre, la bonne description et la bonne couleur.",
      "Les champs d'un embed s'affichent dans le bon ordre et avec les bonnes valeurs.",
      "Les placeholders non renseignés restent compréhensibles et ne font pas planter la commande.",
      "Les configurations de deux serveurs différents restent bien séparées.",
      "Une clé de configuration absente est signalée ou laissée visible comme prévu."
    ]
  },
  {
    title: "5. Permissions et rôles",
    checks: [
      "Une commande réservée aux administrateurs est refusée à un membre sans cette permission.",
      "Un membre autorisé peut exécuter la commande réservée aux administrateurs.",
      "Une action nécessitant une permission manquante affiche une erreur compréhensible.",
      "L'ajout et le retrait d'un rôle fonctionnent avec un rôle de test dédié.",
      "Le bot refuse de gérer un rôle situé au-dessus de son propre rôle.",
      "Les actions sur les salons respectent les permissions du membre et celles du bot."
    ]
  },
  {
    title: "6. Salons, messages et fils",
    checks: [
      "Le bot envoie un message dans le salon de test prévu.",
      "La lecture de messages respecte les permissions et l'historique du salon.",
      "La modification et la suppression fonctionnent sur des messages de test appropriés.",
      "Les réactions, épingles et pièces jointes fonctionnent si ces fonctions sont utilisées.",
      "La création et la modification d'un salon fonctionnent dans l'espace de test.",
      "La création, l'envoi et l'archivage d'un fil fonctionnent correctement."
    ]
  },
  {
    title: "7. Événements Discord",
    checks: [
      "L'événement d'arrivée d'un membre se déclenche si le programme le déclare.",
      "Les événements de message ou de réaction fonctionnent si le programme les déclare et si les intents sont activés.",
      "Les événements vocaux réagissent correctement si cette fonctionnalité est utilisée.",
      "Les messages privés reçus sont traités comme prévu si l'événement correspondant est déclaré."
    ]
  },
  {
    title: "8. Fiabilité et fin de test",
    checks: [
      "Une erreur de permission Discord est expliquée en français sans révéler de secret.",
      "Une erreur d'intent indique quoi vérifier dans le portail développeur Discord.",
      "Le bot continue de répondre après plusieurs commandes lancées à la suite.",
      "Les commandes fonctionnent aussi après un redémarrage complet du bot.",
      "Aucun message de test indésirable ni objet temporaire inutile ne reste sur le serveur."
    ]
  }
];

async function main() {
  const checks = sections.flatMap(section =>
    section.checks.map(description => ({ section: section.title, description }))
  );
  const results = [];
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const progress = (done, total) => {
    const width = 24;
    const filled = Math.round((done / total) * width);
    const bar = "#".repeat(filled) + "-".repeat(width - filled);
    return `[${bar}] ${done}/${total} (${Math.round((done / total) * 100)}%)`;
  };

  console.log("\nFBP | Validation manuelle de la version stable");
  console.log("Ces contrôles se font sur un vrai bot connecté à un serveur Discord.");
  console.log("Prépare un serveur de test, un salon dédié et des rôles de test.");
  console.log("Ne teste pas les suppressions ou la modération sur des données réelles.");
  console.log("Réponds Y si le contrôle réussit, N s'il échoue. Entrée seule = N.");
  console.log(`\n${checks.length} contrôles à effectuer.\n`);

  let currentSection = "";
  try {
    for (let index = 0; index < checks.length; index++) {
      const check = checks[index];
      if (check.section !== currentSection) {
        currentSection = check.section;
        console.log(`\n${currentSection}`);
      }

      let answer = "";
      while (answer !== "y" && answer !== "n") {
        const raw = await rl.question(
          `\n${progress(index, checks.length)} | ${index + 1}. ${check.description}\n   Réussi ? [Y/N] : `
        );
        answer = raw.trim().toLowerCase();
        if (answer === "") answer = "n";
        if (answer !== "y" && answer !== "n") {
          console.log("Réponse invalide. Tape Y ou N.");
        }
      }

      results.push({ ...check, passed: answer === "y" });
      console.log(answer === "y" ? "   ✓ PASS" : "   ✗ FAIL");
    }
  } catch {
    console.log("\nLe questionnaire a été interrompu. Les contrôles restants ne sont pas validés.");
    results.push(...checks.slice(results.length).map(check => ({ ...check, passed: false, interrupted: true })));
  } finally {
    rl.close();
  }

  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  const interrupted = failed.filter(result => result.interrupted);

  console.log("\n" + "=".repeat(48));
  console.log("RÉSULTAT DE LA VALIDATION FBP");
  console.log("=".repeat(48));
  console.log(progress(results.length, checks.length));
  console.log(`PASS : ${passed.length}/${checks.length}`);
  console.log(`FAIL : ${failed.length}/${checks.length}`);

  if (failed.length) {
    console.log("\nContrôles à corriger ou à retester :");
    failed.filter(result => !result.interrupted).forEach(result => {
      console.log(`- [${result.section}] ${result.description}`);
    });
    if (interrupted.length) {
      console.log(`- Questionnaire interrompu : ${interrupted.length} contrôle(s) restant(s) considérés comme non validés.`);
    }
    console.log("\nSTATUT : NOT PASS - ne valide pas encore la version stable.");
    process.exitCode = 1;
  } else {
    console.log("\nSTATUT : TESTS GOOD PASS - tous les contrôles manuels sont validés.");
    console.log("La validation manuelle est réussie. Lance aussi « npm test » avant toute publication.");
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Impossible de lancer la validation stable :", error.message);
    process.exitCode = 1;
  });
}

module.exports = { sections };
