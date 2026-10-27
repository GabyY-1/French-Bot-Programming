#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { FbpCompiler } from "./compiler";
import { FbpError } from "./errors";

const VERSION = "1.1.2";

function help(): void {
  console.log(`FBP — French Bot Programming

Utilisation :
  fbp help                 Affiche cette aide
  fbp version              Affiche la version de FBP
  fbp info                 Affiche les informations du moteur
  fbp ping                 Vérifie que le CLI répond
  fbp run <commande>       Exécute une commande de commandes.fbp
  fbp run-file <fichier>   Exécute directement un fichier .fbp`);
}

function ping(): void {
  console.log("FBP : opérationnel");
  console.log(`Version : ${VERSION}`);
  console.log(`Node.js : ${process.version}`);
  console.log("Bot : aucune connexion externe n'est configurée par le CLI seul.");
}

function runCommand(name: string): void {
  const configPath = path.resolve("commandes.fbp");
  if (!fs.existsSync(configPath)) {
    throw new FbpError("Fichier commandes.fbp introuvable à la racine du projet. Crée ce fichier pour définir tes commandes.");
  }

  let commands: unknown;
  try {
    commands = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw new FbpError("commandes.fbp doit contenir un objet JSON valide associant chaque commande à un fichier .fbp.");
  }

  if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
    throw new FbpError("commandes.fbp doit être un objet de commandes.");
  }

  const target = (commands as Record<string, unknown>)[name];
  if (typeof target !== "string" || !target.trim()) {
    const available = Object.keys(commands as object);
    throw new FbpError(`Commande « ${name} » inconnue.${available.length ? ` Commandes disponibles : ${available.join(", ")}.` : " Aucune commande n'est définie."}`);
  }

  new FbpCompiler().runFile(path.resolve(path.dirname(configPath), target));
}

function main(): void {
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
        console.log(`FBP ${VERSION}`);
        break;
      case "info":
        console.log("FBP — French Bot Programming");
        console.log("Moteur : TypeScript / Node.js");
        console.log("Fichiers source : .fbp");
        break;
      case "ping":
        ping();
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

main();
