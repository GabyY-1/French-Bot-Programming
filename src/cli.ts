#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FbpCompiler } from "./compiler";
import { FbpError } from "./errors";

const packagePath = path.resolve(__dirname, "../package.json");
const VERSION: string = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;

function compareVersions(first: string, second: string): number {
  const parse = (version: string) => version.replace(/^v/, "").split(/[.+-]/).map(part => {
    const number = Number(part);
    return Number.isFinite(number) ? number : 0;
  });
  const a = parse(first);
  const b = parse(second);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

async function printVersion(): Promise<void> {
  console.log(`FBP ${VERSION}`);
  try {
    const response = await fetch("https://registry.npmjs.org/fbp-language/latest", {
      signal: AbortSignal.timeout(3000),
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error("Registre npm indisponible.");
    const latest = await response.json() as { version?: unknown };
    if (typeof latest.version !== "string") throw new Error("Version npm invalide.");
    console.log(`Version publiée sur npm : ${latest.version}`);

    const comparison = compareVersions(VERSION, latest.version);
    if (comparison > 0) {
      console.log("La version locale de FBP est en avance sur npm.");
    } else if (comparison < 0) {
      console.log("Une version plus récente est disponible sur npm : npm install -g fbp-language@latest");
    } else {
      console.log("FBP est à jour.");
    }
  } catch {
    console.log("Version npm non vérifiée (connexion indisponible).");
  }
}

function help(): void {
  console.log(`FBP — French Bot Programming

Utilisation :
  fbp help                 Affiche cette aide
  fbp version              Affiche la version locale et vérifie npm
  fbp info                 Affiche les informations du moteur
  fbp ping                 Vérifie que le CLI répond
  fbp doctor               Vérifie l'environnement et le projet
  fbp where                Affiche les chemins utiles
  fbp init                 Prépare un projet FBP et le support VS Code
  fbp -init                Alias de init
  fbp list                 Liste les commandes du projet
  fbp commands             Alias de list
  fbp check                Vérifie commandes.fbp et les fichiers ciblés
  fbp validate             Alias de check
  fbp example              Affiche un exemple FBP minimal
  fbp example --create     Crée exemple.fbp sans écraser un fichier existant
  fbp run <commande>       Exécute une commande de commandes.fbp
  fbp run-file <fichier>   Exécute directement un fichier .fbp

Options :
  fbp --help, -h           Affiche cette aide
  fbp --version, -v        Alias de version`);
}

function ping(): void {
  console.log("FBP : opérationnel");
  console.log(`Version : ${VERSION}`);
  console.log(`Node.js : ${process.version}`);
  console.log("Bot : aucune connexion externe n'est configurée par le CLI seul.");
}

function initProject(): void {
  const root = process.cwd();
  const commandsPath = path.join(root, "commandes.fbp");
  const mainDir = path.join(root, "scripts");
  const mainPath = path.join(mainDir, "main.fbp");

  fs.mkdirSync(mainDir, { recursive: true });
  if (!fs.existsSync(commandsPath)) {
    fs.writeFileSync(commandsPath, JSON.stringify({ lancer: "scripts/main.fbp" }, null, 2) + "\n", "utf8");
    console.log("Créé : commandes.fbp");
  } else {
    console.log("Conservé : commandes.fbp existe déjà.");
  }

  if (!fs.existsSync(mainPath)) {
    fs.writeFileSync(mainPath, 'nom = "Mon projet"\n\nlance() {\n  affiche("FBP fonctionne !")\n  affiche("Projet :", nom)\n}\n\nlance()\n', "utf8");
    console.log("Créé : scripts/main.fbp");
  } else {
    console.log("Conservé : scripts/main.fbp existe déjà.");
  }

  installVscodeSupport();
  console.log("\nProjet FBP initialisé. Lance « fbp run lancer » pour exécuter le programme.");
}

function installVscodeSupport(): void {
  const bundledExtension = path.resolve(__dirname, "../vscode-extension");
  const manifestPath = path.join(bundledExtension, "package.json");
  if (!fs.existsSync(manifestPath)) {
    console.log("Support VS Code non trouvé dans le package. La coloration et l'icône n'ont pas été installées.");
    return;
  }

  const extensionRoot = process.env.VSCODE_AGENT_FOLDER
    ? path.join(process.env.VSCODE_AGENT_FOLDER, "extensions")
    : process.platform === "win32"
      ? path.join(process.env.USERPROFILE || os.homedir(), ".vscode", "extensions")
      : path.join(os.homedir(), ".vscode", "extensions");
  const destination = path.join(extensionRoot, `gabyy1.fbp-language-${VERSION}`);

  try {
    fs.mkdirSync(extensionRoot, { recursive: true });
    if (fs.existsSync(destination)) {
      console.log(`Support VS Code déjà présent, conservé : ${destination}`);
      return;
    }
    fs.cpSync(bundledExtension, destination, { recursive: true });
    console.log(`Support VS Code installé dans : ${destination}`);
    console.log("Recharge la fenêtre VS Code pour activer la coloration FBP.");
    console.log("Pour afficher l'icône personnalisée, sélectionne « FBP File Icons » dans le thème d'icônes de fichiers.");
  } catch (error) {
    console.log("Installation automatique du support VS Code impossible.");
    console.log("Vérifie les permissions du dossier des extensions VS Code.");
    if (error instanceof Error) console.log(error.message);
  }
}

type CommandMap = Record<string, string>;

function readCommandConfig(): { configPath: string; commands: CommandMap } {
  const configPath = path.resolve("commandes.fbp");
  if (!fs.existsSync(configPath)) {
    throw new FbpError("Fichier commandes.fbp introuvable à la racine du projet. Lance « fbp init » pour créer un projet.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw new FbpError("commandes.fbp n'est pas un JSON valide. Vérifie les guillemets, virgules et accolades.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FbpError("commandes.fbp doit contenir un objet JSON associant chaque commande à un fichier .fbp.");
  }

  const commands: CommandMap = {};
  for (const [name, target] of Object.entries(parsed)) {
    if (typeof target !== "string" || !target.trim()) {
      throw new FbpError(`La cible de la commande « ${name} » doit être un chemin de fichier non vide.`);
    }
    commands[name] = target;
  }

  return { configPath, commands };
}

function listCommands(): void {
  const { commands, configPath } = readCommandConfig();
  const entries = Object.entries(commands);
  console.log(`Commandes du projet (${path.relative(process.cwd(), configPath) || "commandes.fbp"}) :`);
  if (!entries.length) {
    console.log("Aucune commande déclarée.");
    return;
  }
  for (const [name, target] of entries) {
    console.log(`  ${name.padEnd(20)} ${target}`);
  }
  console.log(`\nTotal : ${entries.length} commande(s)`);
}

function checkProject(): void {
  const { commands, configPath } = readCommandConfig();
  const entries = Object.entries(commands);
  const missing: string[] = [];
  for (const [name, target] of entries) {
    const targetPath = path.resolve(path.dirname(configPath), target);
    if (!fs.existsSync(targetPath)) missing.push(`${name} → ${target}`);
    else if (!fs.statSync(targetPath).isFile()) missing.push(`${name} → ${target} (ce n'est pas un fichier)`);
  }

  if (missing.length) {
    console.error(`Vérification échouée : ${missing.length} cible(s) introuvable(s).`);
    for (const item of missing) console.error(`  ✗ ${item}`);
    process.exitCode = 1;
    return;
  }

  console.log("Vérification réussie : commandes.fbp est un JSON valide.");
  console.log(`${entries.length} commande(s) vérifiée(s), ${entries.length ? "toutes les cibles existent" : "aucune cible déclarée"}.`);
}

function doctor(): void {
  let issues = 0;
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  console.log("Diagnostic FBP");
  console.log(`  FBP : ${VERSION}`);
  console.log(`  Node.js : ${process.version} ${nodeMajor >= 20 ? "✓" : "✗ (Node.js 20 ou plus requis)"}`);
  if (nodeMajor < 20) issues++;

  const configPath = path.resolve("commandes.fbp");
  if (fs.existsSync(configPath)) {
    console.log("  commandes.fbp : présent ✓");
    try {
      const { commands } = readCommandConfig();
      const missing = Object.entries(commands).filter(([, target]) =>
        !fs.existsSync(path.resolve(path.dirname(configPath), target))
      );
      if (missing.length) {
        console.log(`  Fichiers ciblés : ${missing.length} manquant(s) ✗`);
        issues++;
      } else {
        console.log(`  Fichiers ciblés : ${Object.keys(commands).length} vérifié(s) ✓`);
      }
    } catch (error) {
      console.log(`  Configuration : ${error instanceof Error ? error.message : String(error)} ✗`);
      issues++;
    }
  } else {
    console.log("  commandes.fbp : absent (pas dans un projet initialisé)");
  }

  console.log(`  Dossier : ${process.cwd()}`);
  if (issues) {
    console.log(`Diagnostic terminé avec ${issues} problème(s).`);
    process.exitCode = 1;
  } else {
    console.log("Diagnostic terminé : aucun problème détecté dans les vérifications effectuées.");
  }
}

function printExample(createFile: boolean): void {
  const example = 'nom = "Mon projet"\\n\\nlance() {\\n  affiche("FBP fonctionne !")\\n  affiche("Projet :", nom)\\n}\\n\\nlance()\\n';
  if (!createFile) {
    console.log("Exemple FBP minimal :\\n");
    console.log(example);
    console.log("Pour le sauvegarder : fbp example --create");
    return;
  }

  const target = path.resolve("exemple.fbp");
  if (fs.existsSync(target)) {
    throw new FbpError("exemple.fbp existe déjà. Le fichier a été conservé.");
  }
  fs.writeFileSync(target, example, "utf8");
  console.log(`Exemple créé : ${target}`);
}

function printPaths(): void {
  console.log(`Dossier courant : ${process.cwd()}`);
  console.log(`CLI FBP : ${path.resolve(__dirname, "cli.js")}`);
  console.log(`Package : ${packagePath}`);
  console.log(`Configuration projet : ${path.resolve("commandes.fbp")}`);
}

function runCommand(name: string): void {
  const { configPath, commands } = readCommandConfig();
  const target = commands[name];
  if (typeof target !== "string") {
    const available = Object.keys(commands);
    throw new FbpError(`Commande « ${name} » inconnue.${available.length ? ` Commandes disponibles : ${available.join(", ")}.` : " Aucune commande n'est définie."}`);
  }

  new FbpCompiler().runFile(path.resolve(path.dirname(configPath), target));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
      case undefined:
        help();
        break;
      case "version":
      case "--version":
      case "-v":
        await printVersion();
        break;
      case "info":
        console.log("FBP — French Bot Programming");
        console.log("Moteur : TypeScript / Node.js");
        console.log("Fichiers source : .fbp");
        break;
      case "ping":
        ping();
        break;
      case "doctor":
        doctor();
        break;
      case "where":
        printPaths();
        break;
      case "list":
      case "commands":
        listCommands();
        break;
      case "check":
      case "validate":
        checkProject();
        break;
      case "example":
        printExample(args.includes("--create"));
        break;
      case "-init":
      case "init":
        initProject();
        break;
      case "run":
        if (!args[0]) throw new FbpError("Indique le nom de la commande. Exemple : fbp run lancer");
        runCommand(args[0]);
        break;
      case "run-file":
        if (!args[0]) throw new FbpError("Indique un fichier. Exemple : fbp run-file bot/main.fbp");
        new FbpCompiler().runFile(args[0]);
        break;
      default:
        throw new FbpError(`Commande CLI inconnue : « ${command} ». Utilise « fbp help » pour afficher l'aide.`);
    }
  } catch (error) {
    if (error instanceof FbpError) {
      console.error(error.format());
      process.exitCode = 1;
    } else {
      console.error("Erreur FBP : une erreur inattendue est survenue.");
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}

void main();
