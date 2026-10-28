const vscode = require("vscode");

const builtins = [
  ["affiche", "Affiche une ou plusieurs valeurs dans le terminal."],
  ["ping", "Vérifie que le moteur FBP répond."],
  ["connexion", "Connecte le bot à Discord."],
  ["commande", "Déclare une commande slash avec une réponse texte."],
  ["commandeEmbed", "Déclare une commande slash avec un embed."],
  ["champ", "Ajoute un champ fixe à un embed."],
  ["champDynamique", "Ajoute un champ alimenté par une source Discord."],
  ["evenementMembre", "Réagit à l'arrivée, au départ et aux changements de membres."],
  ["evenementMessage", "Réagit aux messages reçus."],
  ["evenementReaction", "Réagit à l'ajout ou au retrait d'une réaction."],
  ["evenementInteraction", "Réagit aux boutons, menus de sélection et formulaires."],
  ["evenementVocal", "Réagit aux arrivées et départs des salons vocaux."],
  ["evenementServeur", "Réagit aux changements du serveur et aux événements de modération."],
  ["evenementPrive", "Réagit aux messages privés reçus par le bot."],
  ["vocalRejoindre", "Rejoint un salon vocal."],
  ["vocalQuitter", "Quitte le salon vocal."],
  ["invitationCreer", "Crée une invitation Discord."],
  ["sondageCreer", "Publie un sondage Discord."],
  ["webhookCreer", "Crée un webhook dans un salon."],
  ["webhookEnvoyer", "Envoie un message via un webhook Discord."],
  ["messagePrive", "Envoie un message privé à un membre."]
  ["optionTexte", "Ajoute une option texte à une commande slash."],
  ["optionNombre", "Ajoute une option numérique."],
  ["optionEntier", "Ajoute une option entière."],
  ["optionBooleen", "Ajoute une option vrai/faux."],
  ["optionSalon", "Ajoute un sélecteur de salon."],
  ["optionUtilisateur", "Ajoute un sélecteur de membre à un embed."],
  ["choixTexte", "Ajoute un choix à une option texte."],
  ["choixEntier", "Ajoute un choix à une option entière."],
  ["optionNombreLimites", "Définit les limites d'une option numérique."],
  ["optionEntierLimites", "Définit les limites d'une option entière."]
];

const keywords = [
  ["import", "Importe des fonctions depuis un autre fichier FBP."],
  ["de", "Introduit le chemin d'un import."],
  ["true", "Valeur booléenne vraie."],
  ["false", "Valeur booléenne fausse."]
];

function provideCompletions(document, position) {
  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  const items = [];
  for (const [name, detail] of builtins) {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
    item.detail = "Fonction FBP intégrée";
    item.documentation = new vscode.MarkdownString(detail);
    item.insertText = new vscode.SnippetString(name + "($0)");
    item.sortText = "0-" + name;
    items.push(item);
  }
  for (const [name, detail] of keywords) {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Keyword);
    item.detail = "Mot-clé FBP";
    item.documentation = detail;
    item.sortText = "1-" + name;
    items.push(item);
  }

  const declaredFunctions = /(?:^|\n)\s*([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{/gu;
  for (const match of document.getText().matchAll(declaredFunctions)) {
    const name = match[1];
    if (builtins.some(([builtin]) => builtin === name)) continue;
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
    item.detail = "Fonction définie dans ce fichier";
    item.insertText = new vscode.SnippetString(name + "($0)");
    items.push(item);
  }

  const variables = /(?:^|\n)\s*([\p{L}_][\p{L}\p{N}_]*)\s*=\s*[^=]/gu;
  for (const match of document.getText().matchAll(variables)) {
    const name = match[1];
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
    item.detail = "Variable FBP";
    item.sortText = "2-" + name;
    items.push(item);
  }
  return items;
}

function validateDocument(document, collection) {
  if (document.languageId !== "fbp") return;
  const diagnostics = [];
  const lines = document.getText().split(/\r?\n/);
  const stack = [];
  const functionNames = new Set();
  const declaredFunctions = new Set();
  for (const raw of lines) {
    const match = raw.trim().match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{$/u);
    if (match) functionNames.add(match[1]);
  }
  const builtInNames = new Set(builtins.map(([name]) => name));
  const declaration = /^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{$/u;
  const assignment = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u;
  const call = /^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)\s*;?$/u;
  const importLine = /^import\s*\{\s*([^}]+)\s*\}\s*de\s*(["'])(.+?)\2\s*$/u;
  const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;

  function add(lineIndex, text, message, severity = vscode.DiagnosticSeverity.Error) {
    const start = Math.max(0, lines[lineIndex].indexOf(text));
    const end = start + Math.max(1, text.length);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(lineIndex, start, lineIndex, Math.min(lines[lineIndex].length, end)),
      message,
      severity
    );
    diagnostic.source = "FBP";
    diagnostics.push(diagnostic);
  }

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) return;
    if (importLine.test(line)) return;

    const fn = line.match(declaration);
    if (fn) {
      if (declaredFunctions.has(fn[1])) add(index, fn[1], "Cette fonction est déjà définie.");
      declaredFunctions.add(fn[1]);
      stack.push({ name: fn[1], line: index });
      return;
    }

    if (line === "}") {
      if (!stack.length) add(index, "}", "Accolade fermante sans fonction correspondante.");
      else stack.pop();
      return;
    }

    const assign = line.match(assignment);
    if (assign) {
      if (!assign[2].trim()) add(index, assign[1], "Une valeur est attendue après le signe =.");
      return;
    }

    const invocation = line.match(call);
    if (invocation) {
      if (!builtInNames.has(invocation[1]) && !functionNames.has(invocation[1])) {
        add(index, invocation[1], "Fonction inconnue ou non déclarée : " + invocation[1] + ".", vscode.DiagnosticSeverity.Warning);
      }
      if (invocation[2].trim() && /(^|,)\s*(,|$)/.test(invocation[2])) {
        add(index, invocation[2], "Argument vide dans l'appel de fonction.");
      }
      return;
    }

    add(index, line, "Syntaxe FBP non reconnue. Vérifie les parenthèses, les accolades et le signe =.");
  });

  for (const open of stack) {
    add(open.line, lines[open.line].trim(), "La fonction « " + open.name + " » n'est pas fermée par }.");
  }
  collection.set(document.uri, diagnostics);
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("fbp");
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "fbp", scheme: "file" },
      { provideCompletionItems: provideCompletions },
      ".", " "
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => validateDocument(document, diagnostics)),
    vscode.workspace.onDidChangeTextDocument(event => validateDocument(event.document, diagnostics)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri))
  );

  for (const document of vscode.workspace.textDocuments) validateDocument(document, diagnostics);
}

function deactivate() {}

module.exports = { activate, deactivate };
