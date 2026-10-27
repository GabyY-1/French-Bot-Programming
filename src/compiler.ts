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

type DiscordOptionType = "texte" | "nombre" | "entier" | "booleen" | "salon";
type DiscordOption = { name: string; description: string; type: DiscordOptionType; required: boolean; choices?: Array<{ name: string; value: string | number }>; minValue?: number; maxValue?: number };
type DiscordResponse =
  | { type: "text"; content: string; ephemeral?: boolean; options?: DiscordOption[] }
  | { type: "embed"; title: string; description: string; color: string; fields: Array<{ name: string; value: string; dynamic?: boolean }>; userOption?: { name: string; description: string }; options?: DiscordOption[] };

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

  private resolveDiscordValue(
    source: string,
    interaction: import("discord.js").ChatInputCommandInteraction,
    selectedUser: import("discord.js").User | null,
    selectedMember: import("discord.js").GuildMember | null,
    optionValues: Map<string, string>
  ): string {
    const guild = interaction.guild;
    const values: Record<string, string> = {
      "serveur.nom": guild?.name ?? "Serveur indisponible",
      "serveur.id": guild?.id ?? "Indisponible",
      "serveur.creation": guild ? "<t:" + Math.floor(guild.createdTimestamp / 1000) + ":D>" : "Indisponible",
      "membres.nombre": guild ? String(guild.memberCount) : "Indisponible",
      "profil.nom": selectedMember?.displayName ?? selectedUser?.username ?? "Sélectionne un membre",
      "profil.id": selectedUser?.id ?? "Sélectionne un membre",
      "profil.avatar": selectedUser?.displayAvatarURL({ size: 256 }) ?? "Sélectionne un membre",
      "roles.nombre": guild ? String(guild.roles.cache.size) : "Indisponible",
      "salons.nombre": guild ? String(guild.channels.cache.size) : "Indisponible",
      "statistiques.membres": guild ? String(guild.memberCount) : "Indisponible",
      "statistiques.roles": guild ? String(guild.roles.cache.size) : "Indisponible",
      "statistiques.salons": guild ? String(guild.channels.cache.size) : "Indisponible",
      "latence": String(Math.max(0, Math.round(interaction.client.ws.ping))) + " ms",
      "avatar": selectedUser?.displayAvatarURL({ size: 256 }) ?? interaction.user.displayAvatarURL({ size: 256 })
    };
    const optionMatch = source.trim().match(/^option\.([a-z0-9_-]{1,32})$/);
    if (optionMatch) return optionValues.get(optionMatch[1]) ?? "Option indisponible : " + optionMatch[1];
    return source.trim() in values ? values[source.trim()] : "Source inconnue : " + source.trim();
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
    if (name === "connexion") {
      if (this.discordClient) throw new FbpError("La connexion Discord est déjà initialisée.", undefined, line);
      dotenv.config();
      const token = process.env.DISCORD_TOKEN;
      if (!token) throw new FbpError("Token Discord manquant. Ajoute DISCORD_TOKEN dans le fichier .env.", undefined, line);

      const client = new Client({ intents: [GatewayIntentBits.Guilds] });
      this.discordClient = client;

      client.once("ready", async () => {
        try {
          const commands = [...this.discordCommands.entries()].map(([commandName, response]) => {
            const builder = new SlashCommandBuilder()
              .setName(commandName)
              .setDescription(`Commande ${commandName} du bot FBP`);
            if (response.type === "embed" && response.userOption) {
              builder.addUserOption(option =>
                option.setName(response.userOption!.name)
                  .setDescription(response.userOption!.description)
                  .setRequired(false)
              );
            }
            for (const option of response.options ?? []) {
              const add = {
                texte: () => builder.addStringOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  for (const choice of option.choices ?? []) if (typeof choice.value === "string") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                nombre: () => builder.addNumberOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  if (option.minValue !== undefined) item.setMinValue(option.minValue);
                  if (option.maxValue !== undefined) item.setMaxValue(option.maxValue);
                  for (const choice of option.choices ?? []) if (typeof choice.value === "number") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                entier: () => builder.addIntegerOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  if (option.minValue !== undefined) item.setMinValue(option.minValue);
                  if (option.maxValue !== undefined) item.setMaxValue(option.maxValue);
                  for (const choice of option.choices ?? []) if (typeof choice.value === "number") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                booleen: () => builder.addBooleanOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required)),
                salon: () => builder.addChannelOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required))
              }[option.type];
              add();
            }
            return builder.toJSON();
          });
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
          const optionValues = new Map<string, string>();
          for (const option of response.options ?? []) {
            let value: string | null = null;
            if (option.type === "texte") value = interaction.options.getString(option.name);
            else if (option.type === "nombre") {
              const number = interaction.options.getNumber(option.name);
              value = number === null ? null : String(number);
            } else if (option.type === "entier") {
              const number = interaction.options.getInteger(option.name);
              value = number === null ? null : String(number);
            } else if (option.type === "booleen") {
              const boolean = interaction.options.getBoolean(option.name);
              value = boolean === null ? null : String(boolean);
            } else {
              const channel = interaction.options.getChannel(option.name);
              value = channel === null ? null : "#" + channel.name;
            }
            if (value === null && option.required) {
              await interaction.reply({ content: "Option obligatoire indisponible : " + option.name, ephemeral: true });
              return;
            }
            if (value !== null) optionValues.set(option.name, value);
          }
          if (response.type === "text") {
            const content = response.content.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, name: string) =>
              optionValues.has(name) ? optionValues.get(name)! : match
            );
            await interaction.reply({ content, ephemeral: response.ephemeral ?? false });
          } else {
            const embed = new EmbedBuilder()
              .setTitle(response.title)
              .setDescription(response.description)
              .setColor(Number.parseInt(response.color.slice(1), 16));
            const guild = interaction.guild;
            const selectedUser = response.userOption ? interaction.options.getUser(response.userOption.name) : null;
            const selectedMember = selectedUser && guild ? await guild.members.fetch(selectedUser.id).catch(() => null) : null;
            if (response.userOption && selectedUser) optionValues.set(response.userOption.name, selectedMember?.displayName ?? selectedUser.username);
            const fields = response.fields.map(field => ({
              name: field.name,
              value: field.dynamic ? this.resolveDiscordValue(field.value, interaction, selectedUser, selectedMember, optionValues) : field.value.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, name: string) => optionValues.get(name) ?? match),
              inline: false
            }));
            if (fields.length) embed.addFields(fields);
            await interaction.reply({ embeds: [embed] });
          }
        } catch (error: unknown) {
          const message = "Une erreur est survenue pendant l'exécution de cette commande.";
          this.output("Erreur Discord : " + (error instanceof Error ? error.message : String(error)));
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
          }
        }
      });

      void client.login(token).catch((error: unknown) => this.output("Connexion Discord impossible : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "commande") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || typeof values[0] !== "string" || typeof values[1] !== "string") {
        throw new FbpError("Utilisation : commande(\"ping\", \"Pong !\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) {
        throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      }
      this.discordCommands.set(commandName, { type: "text", content: values[1], options: [] });
      return;
    }
    if (name === "commandePrivee") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || typeof values[0] !== "string" || typeof values[1] !== "string") {
        throw new FbpError("Utilisation : commandePrivee(\"nom\", \"réponse visible uniquement par l'utilisateur\").", undefined, line);
      }
      const [commandName, response] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      this.discordCommands.set(commandName, { type: "text", content: response, ephemeral: true, options: [] });
      return;
    }
    if (name === "commandeEmbed") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 4 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : commandeEmbed(nom, titre, description, couleur).", undefined, line);
      }
      const [commandName, title, description, color] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new FbpError("La couleur d'un embed doit être au format hexadécimal, par exemple #5865F2.", undefined, line);
      this.discordCommands.set(commandName, { type: "embed", title, description, color, fields: [], options: [] });
      return;
    }
    if (name === "champDynamique") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : champDynamique(nomCommande, nomChamp, source).", undefined, line);
      }
      const [commandName, fieldName, source] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (command.fields.length >= 25) throw new FbpError("Un embed Discord ne peut pas contenir plus de 25 champs.", undefined, line);
      if (!fieldName.trim() || !source.trim() || fieldName.length > 256 || source.length > 1024) throw new FbpError("Un champ dynamique doit avoir un nom et une source valides.", undefined, line);
      command.fields.push({ name: fieldName, value: source, dynamic: true });
      return;
    }
    if (name === "choixTexte" || name === "choixEntier") {
      if (values.length !== 4 || values.some(value => typeof value !== "string" && typeof value !== "number")) {
        throw new FbpError("Utilisation : choixTexte(nomCommande, nomOption, nomChoix, valeur) ou choixEntier(...).", undefined, line);
      }
      const [commandName, optionName, choiceName, choiceValue] = values;
      if (typeof commandName !== "string" || typeof optionName !== "string" || typeof choiceName !== "string") {
        throw new FbpError("Le nom de la commande, de l'option et du choix doivent être du texte.", undefined, line);
      }
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      const option = (command.options ?? []).find(item => item.name === optionName);
      const expectedType: DiscordOptionType = name === "choixTexte" ? "texte" : "entier";
      if (!option || option.type !== expectedType) throw new FbpError("L'option « " + optionName + " » n'existe pas ou n'a pas le bon type.", undefined, line);
      if (!choiceName.trim() || choiceName.length > 100) throw new FbpError("Le nom d'un choix doit contenir de 1 à 100 caractères.", undefined, line);
      if (expectedType === "texte" && typeof choiceValue !== "string") throw new FbpError("La valeur d'un choix texte doit être du texte.", undefined, line);
      if (expectedType === "entier" && (typeof choiceValue !== "number" || !Number.isInteger(choiceValue))) throw new FbpError("La valeur d'un choix entier doit être un nombre entier.", undefined, line);
      if (option.minValue !== undefined || option.maxValue !== undefined) throw new FbpError("Une option avec des limites numériques ne peut pas recevoir de choix prédéfinis.", undefined, line);
      const choices = option.choices ?? (option.choices = []);
      if (choices.some(choice => choice.name === choiceName || choice.value === choiceValue)) throw new FbpError("Ce nom ou cette valeur de choix existe déjà.", undefined, line);
      if (choices.length >= 25) throw new FbpError("Une option Discord ne peut pas contenir plus de 25 choix.", undefined, line);
      choices.push({ name: choiceName, value: choiceValue as string | number });
      return;
    }
    if (name === "optionNombreLimites" || name === "optionEntierLimites") {
      if (values.length !== 4 || typeof values[0] !== "string" || typeof values[1] !== "string" || typeof values[2] !== "number" || typeof values[3] !== "number") {
        throw new FbpError("Utilisation : optionNombreLimites(commande, option, minimum, maximum) ou optionEntierLimites(...).", undefined, line);
      }
      const [commandName, optionName, minimum, maximum] = values as [string, string, number, number];
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      const expectedType: DiscordOptionType = name === "optionNombreLimites" ? "nombre" : "entier";
      const option = (command.options ?? []).find(item => item.name === optionName);
      if (!option || option.type !== expectedType) throw new FbpError("L'option « " + optionName + " » n'existe pas ou n'a pas le type numérique attendu.", undefined, line);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum || (expectedType === "entier" && (!Number.isInteger(minimum) || !Number.isInteger(maximum)))) {
        throw new FbpError("Les limites doivent être des nombres valides, minimum inférieur ou égal au maximum ; elles doivent être entières pour une option entière.", undefined, line);
      }
      if (option.choices?.length) throw new FbpError("Une option avec des choix prédéfinis ne peut pas recevoir de limites numériques.", undefined, line);
      option.minValue = minimum;
      option.maxValue = maximum;
      return;
    }
    if (name === "optionTexte" || name === "optionNombre" || name === "optionEntier" || name === "optionBooleen" || name === "optionSalon") {
      if (values.length < 3 || values.length > 4 || values.some(value => typeof value !== "string" && typeof value !== "boolean")) {
        throw new FbpError("Utilisation : optionTexte/Nombre/Entier/Booleen/Salon(nomCommande, nomOption, description, obligatoire).", undefined, line);
      }
      const [commandName, optionName, description] = values;
      const required = values.length === 4 ? values[3] : false;
      if (typeof commandName !== "string" || typeof optionName !== "string" || typeof description !== "string" || typeof required !== "boolean") {
        throw new FbpError("Les trois premiers arguments doivent être du texte et le quatrième, facultatif, doit être true ou false.", undefined, line);
      }
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(optionName)) throw new FbpError("Le nom de l'option doit contenir 1 à 32 caractères minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!description.trim() || description.length > 100) throw new FbpError("La description de l'option doit contenir 1 à 100 caractères.", undefined, line);
      const options = command.options ?? (command.options = []);
      if (options.some(option => option.name === optionName) || (command.type === "embed" && command.userOption?.name === optionName)) throw new FbpError("L'option « " + optionName + " » existe déjà pour cette commande.", undefined, line);
      if (options.length + (command.type === "embed" && command.userOption ? 1 : 0) >= 25) throw new FbpError("Une commande slash Discord ne peut pas contenir plus de 25 options.", undefined, line);
      const type: DiscordOptionType = name === "optionTexte" ? "texte" : name === "optionNombre" ? "nombre" : name === "optionEntier" ? "entier" : name === "optionBooleen" ? "booleen" : "salon";
      options.push({ name: optionName, description, type, required });
      return;
    }
    if (name === "optionUtilisateur") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : optionUtilisateur(nomCommande, nomOption, description).", undefined, line);
      }
      const [commandName, optionName, description] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(optionName)) throw new FbpError("Le nom de l'option doit contenir 1 à 32 caractères minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!description.trim() || description.length > 100) throw new FbpError("La description de l'option doit contenir 1 à 100 caractères.", undefined, line);
      const options = command.options ?? (command.options = []);
      if (options.some(option => option.name === optionName) || command.userOption?.name === optionName) throw new FbpError("L'option « " + optionName + " » existe déjà pour cette commande.", undefined, line);
      if (options.length + 1 > 25) throw new FbpError("Une commande slash Discord ne peut pas contenir plus de 25 options.", undefined, line);
      command.userOption = { name: optionName, description };
      return;
    }
    if (name === "champ") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : champ(nomCommande, nomChamp, valeur).", undefined, line);
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
