import fs from "node:fs";
import path from "node:path";
import { FbpError } from "./errors";
import { Client, EmbedBuilder, GatewayIntentBits, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

type ValueType = "texte" | "nombre" | "booleen" | "inconnu";
type Statement =
  | { kind: "assign"; name: string; value: string; line: number }
  | { kind: "function"; name: string; body: Statement[]; line: number }
  | { kind: "call"; name: string; args: string[]; line: number }
  | { kind: "import"; names: string[]; source: string; line: number };

export interface RunOptions {
  onOutput?: (value: unknown) => void;
}

function valueType(value: string): ValueType {
  const v = value.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^'\\]|\\.)*'$/.test(v)) return "texte";
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return "nombre";
  if (v === "true" || v === "false") return "booleen";
  return "inconnu";
}

function splitArguments(raw: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (const char of raw) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseFile(file: string, source: string): Statement[] {
  const lines = source.split(/\r?\n/);
  const root: Statement[] = [];
  const stack: Array<{ name: string; line: number; body: Statement[] }> = [];
  const target = () => stack.length ? stack[stack.length - 1].body : root;

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const importMatch = line.match(/^import\s*\{\s*([^}]+)\s*\}\s*de\s*(["'])(.+?)\2\s*$/);
    if (importMatch) {
      target().push({ kind: "import", names: importMatch[1].split(",").map(x => x.trim()), source: importMatch[3], line: lineNo });
      continue;
    }

    const functionMatch = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{$/u);
    if (functionMatch) {
      const entry = { name: functionMatch[1], line: lineNo, body: [] as Statement[] };
      target().push({ kind: "function", ...entry });
      stack.push(entry);
      continue;
    }

    if (line === "}") {
      if (!stack.length) throw new FbpError("Accolade fermante sans fonction correspondante.", file, lineNo);
      stack.pop();
      continue;
    }

    const assignment = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u);
    if (assignment) {
      target().push({ kind: "assign", name: assignment[1], value: assignment[2].trim(), line: lineNo });
      continue;
    }

    const call = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)\s*;?$/u);
    if (call) {
      target().push({ kind: "call", name: call[1], args: splitArguments(call[2]), line: lineNo });
      continue;
    }

    throw new FbpError(`Syntaxe non reconnue : « ${line} ». Vérifie les parenthèses, les accolades et le signe =.`, file, lineNo);
  }

  if (stack.length) {
    const open = stack[stack.length - 1];
    throw new FbpError(`La fonction « ${open.name} » n'est pas fermée par }.`, file, open.line);
  }
  return root;
}

type DiscordResponse =
  | { type: "text"; content: string }
  | { type: "embed"; title: string; description: string; color: string; fields: Array<{ name: string; value: string }> };

export class FbpCompiler {
  private variables = new Map<string, { type: ValueType; value: unknown }>();
  private functions = new Map<string, Statement & { kind: "function" }>();
  private imports = new Map<string, string>();
  private output: (value: unknown) => void;
  private discordClient?: Client;
  private discordCommands = new Map<string, DiscordResponse>();

  constructor(options: RunOptions = {}) {
    this.output = options.onOutput ?? (value => console.log(value));
  }

  runFile(filePath: string): void {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) throw new FbpError(`Fichier introuvable : ${absolute}`);
    if (!fs.statSync(absolute).isFile()) throw new FbpError(`Le chemin indiqué n'est pas un fichier : ${absolute}`);
    this.execute(parseFile(absolute, fs.readFileSync(absolute, "utf8")), path.dirname(absolute));
  }

  private execute(statements: Statement[], baseDir: string): void {
    for (const statement of statements) {
      if (statement.kind === "import") {
        const targetFile = path.resolve(baseDir, statement.source);
        if (!fs.existsSync(targetFile)) throw new FbpError(`Fichier importé introuvable : ${statement.source}`);
        const nested = parseFile(targetFile, fs.readFileSync(targetFile, "utf8"));
        for (const item of nested) {
          if (item.kind === "function") this.functions.set(item.name, item);
        }
        for (const name of statement.names) {
          if (!this.functions.has(name)) throw new FbpError(`La fonction « ${name} » n'existe pas dans ${statement.source}.`);
          this.imports.set(name, targetFile);
        }
      } else if (statement.kind === "function") {
        if (this.functions.has(statement.name)) throw new FbpError(`La fonction « ${statement.name} » est définie plusieurs fois.`, undefined, statement.line);
        this.functions.set(statement.name, statement);
      } else if (statement.kind === "assign") {
        const type = valueType(statement.value);
        const previous = this.variables.get(statement.name);
        if (previous && type !== "inconnu" && previous.type !== "inconnu" && previous.type !== type) {
          throw new FbpError(`Type incompatible pour « ${statement.name} » : attendu ${previous.type}, reçu ${type}.`, undefined, statement.line);
        }
        const value = this.evaluate(statement.value, statement.line);
        this.variables.set(statement.name, { type: previous?.type ?? type, value });
      } else {
        this.call(statement.name, statement.args, statement.line, baseDir);
      }
    }
  }

  private evaluate(expression: string, line: number): unknown {
    const value = expression.trim();
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(["'\\])/g, "$1");
    }
    if (this.variables.has(value)) return this.variables.get(value)!.value;
    throw new FbpError(`Valeur inconnue « ${value} ». Utilise un texte, un nombre, true, false ou une variable déclarée.`, undefined, line);
  }

  private call(name: string, args: string[], line: number, baseDir: string): void {
    const values = args.map(arg => this.evaluate(arg, line));
    if (name === "affiche") {
      this.output(values.map(value => value === undefined ? "" : String(value)).join(" "));
      return;
    }
    if (name === "discordConnexion") {
      if (this.discordClient) throw new FbpError("La connexion Discord est déjà initialisée.", undefined, line);
      dotenv.config();
      const token = process.env.DISCORD_TOKEN;
      if (!token) throw new FbpError("Token Discord manquant. Ajoute DISCORD_TOKEN dans le fichier .env.", undefined, line);

      const client = new Client({ intents: [GatewayIntentBits.Guilds] });
      this.discordClient = client;

      client.once("ready", async () => {
        try {
          const commands = [...this.discordCommands.entries()].map(([commandName]) =>
            new SlashCommandBuilder()
              .setName(commandName)
              .setDescription(`Commande ${commandName} du bot FBP`)
              .toJSON()
          );
          const manager = client.application?.commands;
          if (!manager) throw new Error("L'application Discord n'est pas disponible.");
          const existing = await manager.fetch();
          for (const command of commands) {
            const registered = existing.find(item => item.name === command.name);
            if (registered) await manager.edit(registered.id, command);
            else await manager.create(command);
          }
          this.output("Connecté à Discord en tant que " + (client.user?.tag ?? "bot") + ".");
          this.output("Commandes slash FBP enregistrées : " + commands.length + ".");
        } catch (error: unknown) {
          this.output("Enregistrement des commandes slash impossible : " + (error instanceof Error ? error.message : String(error)));
        }
      });

      client.on("interactionCreate", async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const response = this.discordCommands.get(interaction.commandName);
        if (response === undefined) return;
        try {
          if (response.type === "text") {
            await interaction.reply(response.content);
          } else {
            const embed = new EmbedBuilder()
              .setTitle(response.title)
              .setDescription(response.description)
              .setColor(Number.parseInt(response.color.slice(1), 16));
            if (response.fields.length) embed.addFields(response.fields.map(field => ({ name: field.name, value: field.value, inline: false })));
            await interaction.reply({ embeds: [embed] });
          }
        } catch (error: unknown) {
          this.output("Erreur Discord : " + (error instanceof Error ? error.message : String(error)));
        }
      });

      void client.login(token).catch((error: unknown) => this.output("Connexion Discord impossible : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "discordCommande") {
      if (!this.discordClient) throw new FbpError("Appelle discordConnexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || typeof values[0] !== "string" || typeof values[1] !== "string") {
        throw new FbpError("Utilisation : discordCommande(\"ping\", \"Pong !\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) {
        throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      }
      this.discordCommands.set(commandName, { type: "text", content: values[1] });
      return;
    }
    if (name === "discordCommandeEmbed") {
      if (!this.discordClient) throw new FbpError("Appelle discordConnexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 4 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : discordCommandeEmbed(nom, titre, description, couleur).", undefined, line);
      }
      const [commandName, title, description, color] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new FbpError("La couleur d'un embed doit être au format hexadécimal, par exemple #5865F2.", undefined, line);
      this.discordCommands.set(commandName, { type: "embed", title, description, color, fields: [] });
      return;
    }
    if (name === "discordChamp") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : discordChamp(nomCommande, nomChamp, valeur).", undefined, line);
      }
      const [commandName, fieldName, fieldValue] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (command.fields.length >= 25) throw new FbpError("Un embed Discord ne peut pas contenir plus de 25 champs.", undefined, line);
      if (!fieldName.trim() || !fieldValue.trim() || fieldName.length > 256 || fieldValue.length > 1024) throw new FbpError("Un champ doit avoir un nom (1 à 256 caractères) et une valeur (1 à 1024 caractères).", undefined, line);
      command.fields.push({ name: fieldName, value: fieldValue });
      return;
    }
    if (name === "ping") {
      this.output("FBP fonctionne. Cette commande ne vérifie pas à elle seule une connexion Discord.");
      return;
    }
    const fn = this.functions.get(name);
    if (!fn) throw new FbpError(`Fonction « ${name} » inconnue. Vérifie son nom ou son import.`, undefined, line);
    this.execute(fn.body, this.imports.has(name) ? path.dirname(this.imports.get(name)!) : baseDir);
  }
}
